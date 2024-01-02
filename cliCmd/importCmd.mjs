import {genFileNameFromNetworkName, loadNetworkAndApiKey, AFFIRMATIVES, tryProcessPortRestrictionString, loadClientForCLI, findDuplicates} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";


const optionToSheetMap = {
    groups: "Group",
    remoteNetworks: "RemoteNetwork",
    resources: "Resource",
    devices: "Device",
    securityPolicies: "SecurityPolicy"
}

const ImportAction = {
    IGNORE: "IGNORE",
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    UPDATE_TRUST: "UPDATE_TRUST",
    ERROR: "ERROR"
}

const primitiveInOrderArrayEquals = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function fetchDataForImport(client, options, wb) {
    let typesToFetch = [],
        sheetNames = wb.SheetNames,
        // If no options are specified then import all
        typesToImport = Object.keys(optionToSheetMap).filter( optionName => options[optionName] != null),
        importAllByDefault = typesToImport.length === 0
    ;
    options.importAllByDefault = importAllByDefault;
    if ( importAllByDefault === true ) Log.info("Importing all types");

    if ( typesToImport.length === 1 && sheetNames.length === 1 ) {
        // Coerce sheetname in case of CSV format
        const typeToImport = typesToImport[0],
              currentSheetName = sheetNames[0],
              expectedSheetName = optionToSheetMap[typeToImport];
        wb.SheetNames.splice(0, 1, expectedSheetName);
        wb.Sheets[expectedSheetName] = wb.Sheets[currentSheetName];
        delete wb.Sheets[currentSheetName];

    }
    for (const [optionName, schemaName] of Object.entries(optionToSheetMap) ) {
        options[optionName] = options[optionName] || importAllByDefault;

        if ( options[optionName] === true ) {
            if ( !sheetNames.includes(schemaName) ) {
                throw new Error(`Cannot import because the Excel file is missing a sheet named '${schemaName}'`);
            }
            typesToFetch.push(schemaName);
        }
    }

    if ( typesToFetch.length === 0 ) {
        throw new Error(`Cannot import because nothing to import`);
    }

    if ( typesToFetch.includes("Resource") ) {
        // If we're importing resources we prob need Groups and Remote Networks too
        if ( !typesToFetch.includes("Group") ) typesToFetch.push("Group");
        if ( !typesToFetch.includes("RemoteNetwork") ) typesToFetch.push("RemoteNetwork");
        if ( !typesToFetch.includes("SecurityPolicy") ) typesToFetch.push("SecurityPolicy");
    }
    else if ( typesToFetch.includes("Group") ) { // note 'else' is intentional
        // If we're importing groups we prob need Resources and Users too
        if ( !typesToFetch.includes("Resource") ) typesToFetch.push("Resource");
        if ( !typesToFetch.includes("User") ) typesToFetch.push("User");
        if ( !typesToFetch.includes("SecurityPolicy") ) typesToFetch.push("SecurityPolicy");
    }

    const allNodes = await client.fetchAll({
        fieldOpts: {
            defaultObjectFieldSet: [TwingateApiClient.FieldSet.LABEL, TwingateApiClient.FieldSet.ID]
        },
        typesToFetch
    });
    allNodes.RemoteNetwork = allNodes.RemoteNetwork || [];
    allNodes.Resource = allNodes.Resource || [];
    allNodes.Group = allNodes.Group || [];
    allNodes.Device = allNodes.Device || [];
    allNodes.User = allNodes.User || [];
    allNodes.SecurityPolicy = allNodes.SecurityPolicy || [];

    return {typesToFetch, allNodes};
}

async function writeImportResults(data, outputFilename) {
    // Write results
    let ImportResultsWb = XLSX.utils.book_new();
    for (const [typeName, records] of Object.entries(data)) {
        let ws = XLSX.utils.json_to_sheet(records);
        ws['!autofilter'] = {ref: ws["!ref"]};
        XLSX.utils.book_append_sheet(ImportResultsWb, ws, typeName);
    }
    await Deno.writeFile(`./${outputFilename}`, new Uint8Array(XLSX.write(ImportResultsWb, {type: "array"})));
}

function tryResourceRowToProtocols(resourceRow) {
    if ( typeof resourceRow.protocolsAllowIcmp === "string") {
        resourceRow.protocolsAllowIcmp = resourceRow.protocolsAllowIcmp.trim().toUpperCase();
        resourceRow.protocolsAllowIcmp = AFFIRMATIVES.includes(resourceRow.protocolsAllowIcmp);
    }
    if ( resourceRow.protocolsTcpPolicy === "ALLOW_ALL" && resourceRow.protocolsUdpPolicy === "ALLOW_ALL" && resourceRow.protocolsAllowIcmp === true) {
        return null;
    }

    let resourceAllowIcmp = (resourceRow.protocolsAllowIcmp === "true" || resourceRow.protocolsAllowIcmp === "TRUE" || resourceRow.protocolsAllowIcmp == undefined || resourceRow.protocolsAllowIcmp === true);

    let protocols = {
        allowIcmp: resourceAllowIcmp,
        tcp: {
            policy: resourceRow.protocolsTcpPolicy == undefined ? "ALLOW_ALL" : resourceRow.protocolsTcpPolicy,
            ports: tryProcessPortRestrictionString(resourceRow.protocolsTcpPorts)
        },
        udp: {
            policy: resourceRow.protocolsUdpPolicy == undefined ? "ALLOW_ALL" : resourceRow.protocolsUdpPolicy,
            ports: tryProcessPortRestrictionString(resourceRow.protocolsUdpPorts)
        }
    }
    return protocols
}

// Poor-mans cache
let nodeLabelIdMap = {
    RemoteNetwork: {},
    Resource: {},
    Group: {},
    Device: {},
    User: {},
    SecurityPolicy: {}
}

const groupIdByName = (name) => nodeLabelIdMap.Group[name];
const userIdByEmail = (email) => nodeLabelIdMap.User[email];
const resourceIdByName = (resourceName) => nodeLabelIdMap.Resource[resourceName];
const remoteNetworkIdByName = (remoteNetworkName) => nodeLabelIdMap.RemoteNetwork[remoteNetworkName];
const securityPolicyIdByName = (securityPolicyLabel) => nodeLabelIdMap.SecurityPolicy[securityPolicyLabel];

export const importCmd = new Command()
    .option("-f, --file <string>", "Path to Excel file to import from", {
        required: true
    })
    .option("-n, --remote-networks [boolean]", "Include Remote Networks")
    .option("-r, --resources [boolean]", "Include Resources")
    .option("-g, --groups [boolean]", "Include Groups")
    //.option("-u, --users [boolean]", "Include Users")
    .option("-d, --devices [boolean]", "Include Devices (trust)")
    .option("-p, --security-policies [boolean]", "Include Security Policies")
    .option("-s, --sync [boolean]", "Attempt to synchronise entities with the same natural identifier")
    .option("-y, --assume-yes [boolean]", "Automatic yes to prompts; assume 'yes' as answer to all prompts")
    .description("Import from excel file to a Twingate account")
    .action(async (options) => {
        const {networkName, apiKey, client} = await loadClientForCLI(options);
        options.apiKey = apiKey;
        options.accountName = networkName;

        let fileData = null
        try {
            fileData = await Deno.readFile(options.file);
            Log.info(`Importing from file: '${Colors.italic(options.file)}'`);
        }
        catch (e) {
            Log.error(`Could not read file: ${options.file}`);
            Log.exception(e);
            return;
        }
        let wb = XLSX.read(fileData,{type:'array', cellDates: true});

        const {typesToFetch, allNodes} = await fetchDataForImport(client, options, wb);

        nodeLabelIdMap = {
            RemoteNetwork: {},
            Resource: {},
            Group: {},
            Device: {},
            User: {},
            SecurityPolicy: {}
        };

        let nodeIdMap = Object.fromEntries([
            ...allNodes.RemoteNetwork,
            ...allNodes.Resource,
            ...allNodes.Group,
            ...allNodes.Device,
            ...allNodes.User,
            ...allNodes.SecurityPolicy
        ].map(n => [n.id, n]));

        // Pre-process users
        for ( let node of allNodes.User) {
            if (node.email == null) continue;
            nodeLabelIdMap.User[node.email.toLowerCase()] = node.id;
        }

        // Pre-process groups
        for ( let node of allNodes.Group) {
            if ( groupIdByName(node.name) != null ) {
                throw new Error(`Group with duplicate name found: '${node.name}' - Ids: ['${groupIdByName(node.name)}', '${node.id}']`);
            }
            nodeLabelIdMap.Group[node.name] = node.id;
        }

        // Pre-process remote networks
        for ( let node of allNodes.RemoteNetwork) {
            if ( nodeLabelIdMap.RemoteNetwork[node.name] != null ) {
                throw new Error(`Remote Network with duplicate name found: '${node.name}' - Ids: ['${nodeLabelIdMap.RemoteNetwork[node.name]}', '${node.id}']`);
            }
            if ( options.resources ) {
                node.resourceNames = node.resources.map(resourceId => nodeIdMap[resourceId].name);
                node.resources = node.resources.map(resourceId => nodeIdMap[resourceId]);
                let duplicateResourceNames = findDuplicates(node.resourceNames);
                if ( duplicateResourceNames.length > 0 ) {
                    throw new Error(`Remote network '${node.name}' contains resources with duplicate names:\n${duplicateResourceNames.join('\n')}`);
                }
            }
            nodeLabelIdMap.RemoteNetwork[node.name] = node.id;
        }

        // Pre-process resources
        for ( let node of allNodes.Resource) {
            if ( resourceIdByName(node.name) != null ) {
                Log.warn(`Resource with duplicate name found: '${node.name}' - Ids: ['${resourceIdByName(node.name)}', '${node.id}'].`);
                if ( options.sync && options.resources) throw new Error(`Sync will not work.`);
            }
            nodeLabelIdMap.Resource[node.name.toLowerCase()] = node.id;
        }

        // Pre-process devices
        for ( let node of allNodes.Device) {
            node.lastConnectedAt = new Date(node.lastConnectedAt);
            if ( options.user ) node.user = nodeIdMap[node.user.id].email;
            if ( node.serialNumber != null && node.serialNumber !== "None" ) {
                if ( nodeLabelIdMap.Device[node.serialNumber] != null ) {
                    let existingNode = nodeIdMap[ nodeLabelIdMap.Device[node.serialNumber] ];
                    Log.warn(`Device with Id '${node.id}' has the same serial number ('${node.serialNumber}') as Device with Id '${existingNode.id}', will take most recently connected device.`);
                    // Try to keep the most recently connected device
                    if ( existingNode.lastConnectedAt >= node.lastConnectedAt ) continue;
                }
                nodeLabelIdMap.Device[node.serialNumber] = node.id;
            }
        }

        // Pre-process security policies
        for ( let node of allNodes.SecurityPolicy) {
            if ( securityPolicyIdByName(node.name) != null ) {
                throw new Error(`Security policy with duplicate name found: '${node.name}' - Ids: ['${securityPolicyIdByName(node.name)}', '${node.id}']`);
            }
            nodeLabelIdMap.SecurityPolicy[node.name] = node.id;
        }

        // Map of old id to new id
        let mergeMap = {};
        let importCount = 0;
        for (const [optionName, schemaName] of Object.entries(optionToSheetMap) ) {
            if ( options[optionName] !== true && options.importAllByDefault === false ) continue;
            let sheetData = XLSX.utils.sheet_to_json(wb.Sheets[schemaName]);
            mergeMap[schemaName] = sheetData;
            switch (schemaName) {
                case "Group":
                    for ( let groupRow of sheetData) {
                        // 1. Skip non-manual groups
                        /*
                        if ( groupRow.type !== "Manual" ) {
                            Log.info(`Group '${groupRow.name}' will be skipped because it is of type '${groupRow.type}'`);
                            groupRow["importAction"] = ImportAction.IGNORE;
                            groupRow["importId"] = "";
                            continue;
                        }
                         */

                        // 2. Check if Group exists
                        let existingId = groupIdByName(groupRow.name);
                        if ( existingId != null ) {
                            let existingGroup = nodeIdMap[existingId];
                            if ( existingGroup == null ) throw new Error(`Unable to resolve group from Id: ${existingId}`);
                            if ( options.sync ) {
                                let importAction = ImportAction.IGNORE;
                                let importId = "";
                                // For groups we check resources and users
                                if ( groupRow.users && existingGroup.type !== "SYNCED") {
                                    let users = [];
                                    existingGroup.users.sort();
                                    groupRow.users.split(",").forEach( email => {
                                        email = email.trim().toLowerCase();
                                        let userId = userIdByEmail(email);
                                        if ( userId == null) {
                                            Log.warn(`Not able to map user '${email}' in group '${groupRow.name}'.`);
                                        }
                                        else {
                                            users.push(userId);
                                        }
                                    });
                                    users.sort();
                                    if ( !primitiveInOrderArrayEquals(users, existingGroup.users) ) {
                                        groupRow._userIds = users;
                                        Log.info(`Will sync user memberships for group: '${groupRow.name}'(${existingId})`)
                                        importAction = ImportAction.UPDATE;
                                        importId = existingId;
                                    }
                                }

                                if ( groupRow.resources ) {
                                    let resources = [];
                                    existingGroup.resources.sort();
                                    groupRow.resources.split(",").forEach( resourceName => {
                                        resourceName = resourceName.trim().toLowerCase();
                                        let resourceId = resourceIdByName(resourceName);
                                        if ( resourceId == null) {
                                            Log.warn(`Not able to map resource '${resourceName}' in group '${groupRow.name}'.`);
                                        }
                                        else {
                                            resources.push(resourceId);
                                        }
                                    });
                                    resources.sort();
                                    if ( !primitiveInOrderArrayEquals(resources, existingGroup.resources) ) {
                                        groupRow._resourceIds = resources;
                                        Log.info(`Will sync resources for group: '${groupRow.name}'(${existingId})`);
                                        importAction = ImportAction.UPDATE;
                                        importId = existingId;
                                    }
                                }

                                groupRow["importAction"] = importAction;
                                if ( importAction !== ImportAction.IGNORE ) importCount++;
                                groupRow["importId"] = importId;
                                continue;
                            }
                            else {
                                Log.info(`Group with same name already exists, will skip: '${groupRow.name}'`);
                                groupRow["importAction"] = ImportAction.IGNORE;
                                groupRow["importId"] = existingId;
                                continue;
                            }
                        }

                        Log.info(`Group will be created: '${groupRow.name}'`);
                        groupRow["importAction"] = ImportAction.CREATE;
                        groupRow["importId"] = null;
                        importCount++;
                    }
                    break;
                case "RemoteNetwork":
                    for ( let remoteNetworkRow of sheetData) {
                        // 1. Check if network exists
                        let existingId = nodeLabelIdMap.RemoteNetwork[remoteNetworkRow.name];
                        if ( existingId != null ) {
                            Log.info(`Remote Network with same name already exists, will skip: '${remoteNetworkRow.name}'`);
                            remoteNetworkRow["importAction"] = ImportAction.IGNORE;
                            remoteNetworkRow["importId"] = existingId;
                            continue;
                        }

                        Log.info(`Remote Network will be created: '${remoteNetworkRow.name}'`);
                        remoteNetworkRow["importAction"] = ImportAction.CREATE;
                        remoteNetworkRow["importId"] = null;
                        importCount++;
                    }
                    break;
                case "Resource":
                    let duplicateResourceTracker = [];
                    for ( let resourceRow of sheetData ) {
                        // ID cell is not empty AND matches an existing resource AND name/address/remotenetwork are provided => UPDATE
                        // ID cell is empty AND name/address/remotenetwork are provided => CREATE
                        // else => IGNORE

                        // A - check if ID was provided AND if it matches an existing resource ID AND there are no duplicates
                        let existingResourceId = null;

                        // A1 - check if ID was provided
                        if (resourceRow.id != null && resourceRow.id != "" && resourceRow.id != undefined){

                            // A2 - check if ID matches an existing resource
                            if ( Object.values(nodeLabelIdMap.Resource).includes(resourceRow.id) ) {
                                existingResourceId = resourceRow.id;

                                // A3 - check for duplicates before proceeding
                                let existingFound = false;
                                for (let i = 0; i < duplicateResourceTracker.length; i++){
                                    if (existingResourceId == duplicateResourceTracker[i]){
                                        existingFound = true;
                                        break;
                                    }
                                }
                                if (existingFound){
                                    Log.error(`Resource will be skipped: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}' - duplicate Id exists.`);
                                    resourceRow["importAction"] = ImportAction.IGNORE;
                                    resourceRow["importId"] = null;

                                    resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                                    importCount++;
                                    continue;
                                } else {
                                    duplicateResourceTracker.push(existingResourceId);
                                }
                            }
                        }

                        // B - ensure resource CREATE/UPDATE requirements are met (name/addressValue/remoteNetworkLabel)
                        // name
                        if (resourceRow.name == null || resourceRow.name == "" || resourceRow.name == undefined){
                            Log.error(`Resource will be skipped: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}' - name is required.`);
                            resourceRow["importAction"] = ImportAction.IGNORE;
                            resourceRow["importId"] = null;

                            resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                            importCount++;
                            continue;
                            //break;
                        }
                        // addressValue
                        if (resourceRow.addressValue == null || resourceRow.addressValue == "" || resourceRow.addressValue == undefined){
                            Log.error(`Resource will be skipped: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}' - addressValue is required.`);
                            resourceRow["importAction"] = ImportAction.IGNORE;
                            resourceRow["importId"] = null;

                            resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                            importCount++;
                            continue;
                            //break;
                        }
                        // remoteNetworkLabel
                        if (resourceRow.remoteNetworkLabel == null || resourceRow.remoteNetworkLabel == "" || resourceRow.remoteNetworkLabel == undefined){
                            Log.error(`Resource will be skipped: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}' - remoteNetworkLabel is required.`);
                            resourceRow["importAction"] = ImportAction.IGNORE;
                            resourceRow["importId"] = null;

                            resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                            importCount++;
                            continue;
                            //break;
                        }

                        // 1 - if resourceRow.id is not empty AND matches an existing resource id (A) AND name/addressValue/remoteNetworkLabel are provided (B) => UPDATE
                        if (existingResourceId != null){
                            Log.info(`Resource will be updated: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}'.`);
                            resourceRow["importAction"] = ImportAction.UPDATE;
                            resourceRow["importId"] = existingResourceId;

                            resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                            importCount++;
                            continue;
                            //break;

                        // 2 - if resourceRow.id is empty (A) AND name/addressValue/remoteNetworkLabel are provided (B) => CREATE
                        } else if (existingResourceId == null){
                            Log.info(`Resource will be created: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}'.`);
                            resourceRow["importAction"] = ImportAction.CREATE;
                            resourceRow["importId"] = null;

                            resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                            importCount++;
                            continue;
                            //break;

                        // 3 - ELSE => IGNORE
                        } else {
                            Log.error(`Resource will be skipped: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}' - default ignore.`);
                            resourceRow["importAction"] = ImportAction.IGNORE;
                            resourceRow["importId"] = null;

                            resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);
                            importCount++;
                            continue;
                            //break;
                        }
                    }
                    break;
                case "Device":
                    for ( let deviceRow of sheetData ) {
                        if ( deviceRow.serialNumber == null || deviceRow.serialNumber === "") {
                            Log.info(`IGNORE - Row with missing serial number: '${deviceRow}'.`);
                            deviceRow["importAction"] = ImportAction.IGNORE;
                            continue;
                        }
                        let existingDevice = nodeIdMap[ nodeLabelIdMap.Device[deviceRow.serialNumber] ];
                        if ( existingDevice == null ) {
                            Log.info(`IGNORE - Device with serial number '${deviceRow.serialNumber}' - not found.`);
                            deviceRow["importAction"] = ImportAction.IGNORE;
                            continue;
                        }
                        deviceRow.isTrusted = (deviceRow.isTrusted === true) || (typeof deviceRow.isTrusted === "string" && AFFIRMATIVES.includes(deviceRow.isTrusted.trim().toUpperCase()) );
                        if ( existingDevice.isTrusted === deviceRow.isTrusted ) {
                            Log.info(`IGNORE - Device with serial number '${deviceRow.serialNumber}' (${existingDevice.id}) - No change in trust`);
                            deviceRow["importAction"] = ImportAction.IGNORE;
                            continue;
                        }
                        Log.info(`UPDATE - Device with serial number '${existingDevice.serialNumber}' (${existingDevice.id}) - Change trust to: ${Colors.italic(deviceRow.isTrusted+"")}`);
                        if ( deviceRow.id == null ) deviceRow.id = existingDevice.id;
                        deviceRow["importAction"] = ImportAction.UPDATE_TRUST;
                        deviceRow["importId"] = existingDevice.id;
                        importCount++;
                    }
                    break;
                case "SecurityPolicy":
                    for ( let securityPolicyRow of sheetData) {
                        // 1. Check if network exists
                        let existingId = nodeLabelIdMap.SecurityPolicy[securityPolicyRow.name];
                        if ( existingId != null ) {
                            Log.info(`Security Policy with same name already exists, will skip: '${securityPolicyRow.name}'`);
                            securityPolicyRow["importAction"] = ImportAction.IGNORE;
                            securityPolicyRow["importId"] = existingId;
                            continue;
                        }

                        Log.info(`Remote Network will be created: '${securityPolicyRow.name}'`);
                        securityPolicyRow["importAction"] = ImportAction.CREATE;
                        securityPolicyRow["importId"] = null;
                        importCount++;
                    }
                    break;
                default:
                    // NoOp
                    break;
            }
        }

        if ( importCount === 0 ) {
            Log.info("No data to import.");
            return;
        }
        if ( options.assumeYes !== true && !(await Confirm.prompt("Please confirm to continue?")) ) return;

        // Pass through all records to import and import them
        for ( const [schemaName, importData] of Object.entries(mergeMap)) {
            const recordsToImport = importData.filter(row => row.importAction !== ImportAction.IGNORE);
            Log.info(`Importing ${recordsToImport.length} record(s) as ${schemaName}s`);
            switch (schemaName) {
                case "Group":
                    for ( let groupRow of recordsToImport ) {
                        switch ( groupRow.importAction ) {
                            case ImportAction.CREATE:
                                let newGroup = await client.createGroup(groupRow.name);
                                groupRow.importId = newGroup.id;
                                nodeIdMap[newGroup.id] = {...newGroup, _imported: true};
                                allNodes.Group.push(nodeIdMap[newGroup.id]);
                                nodeLabelIdMap.Group[groupRow.name] = newGroup.id;
                                break;
                            case ImportAction.UPDATE:
                                let result = await client.setGroupUsersAndResources(groupRow.importId, groupRow._userIds, groupRow._resourceIds);
                                if ( result.ok !== true || result.error != null ) {
                                    Log.error(`Error syncing group: '${groupRow.name}'(${groupRow.importId}): ${result.error}`);
                                }
                                break;
                            default:
                                // NoOp
                                break;
                        }

                    }
                    break;
                case "RemoteNetwork":
                    for ( let remoteNetworkRow of recordsToImport ) {
                        let newRemoteNetwork = await client.createRemoteNetwork(remoteNetworkRow.name);
                        remoteNetworkRow.importId = newRemoteNetwork.id;
                        nodeIdMap[newRemoteNetwork.id] = {...newRemoteNetwork, name: remoteNetworkRow.name, resources: [], resourceNames: [], _imported: true};
                        allNodes.RemoteNetwork.push(nodeIdMap[newRemoteNetwork.id]);
                        nodeLabelIdMap.RemoteNetwork[remoteNetworkRow.name] = newRemoteNetwork.id;
                    }
                    break;
                case "Resource":
                    for ( let resourceRow of recordsToImport ) {
                        switch ( resourceRow.importAction ) {
                            case ImportAction.CREATE:
                                let remoteNetwork = nodeIdMap[nodeLabelIdMap.RemoteNetwork[resourceRow.remoteNetworkLabel]];
                                if ( remoteNetwork == null ) {
                                    // TODO
                                    Log.warn(`Remote network not matched '${resourceRow.remoteNetworkLabel}' in resource '${resourceRow.name}' not matched, will skip.`);
                                    continue;
                                }
                                let groups = resourceRow.groups || "";
                                let groupIds = groups
                                    .split(",")
                                    .map(r => r.trim())
                                    .map(groupName => {
                                        let groupId = groupIdByName(groupName);
                                        if ( groupId == null ) {
                                            Log.warn(`Group with name '${groupName}' in resource '${resourceRow.name}' not matched. Resource will be created without a group assignment.`);
                                        }
                                        return groupId;
                                    })
                                    .filter(groupId => groupId != null)

                                // NEEDS FR:
                                //isActive (Boolean)
                                //serviceAccounts ([])
                                
                                let remoteNetworkId = remoteNetworkIdByName(resourceRow.remoteNetworkLabel);
                                let securityPolicyId = securityPolicyIdByName(resourceRow.securityPolicyLabel);
                                let isVisible = (resourceRow.isVisible === "true" || resourceRow.isVisible === "TRUE" || resourceRow.isVisible == undefined || resourceRow.isVisible === true);
                                let isBrowserShortcutEnabled = (resourceRow.isBrowserShortcutEnabled === "true" || resourceRow.isBrowserShortcutEnabled === "TRUE" || resourceRow.isBrowserShortcutEnabled == undefined || resourceRow.isBrowserShortcutEnabled === true);
                                let newResource = await client.createResource(resourceRow.name, resourceRow.addressValue, remoteNetworkId, resourceRow._protocol, groupIds, resourceRow.alias, isBrowserShortcutEnabled, isVisible, securityPolicyId);
                                
                                resourceRow.importId = newResource.id;
                                delete resourceRow._protocol;
                                remoteNetwork.resourceNames.push(resourceRow.name);
                                remoteNetwork.resources.push({name: resourceRow.name, _imported: true});
                                break;
                            case ImportAction.UPDATE:
                                // FUTURE
                                let r_addedGroupIds = [];
                                let r_removedGroupIds = [];
                                // ServiceAccounts ([])

                                //groupIds
                                let groups2 = resourceRow.groups || "";
                                let groupIds2 = groups2
                                    .split(",")
                                    .map(r => r.trim())
                                    .map(groupName => {
                                        let groupId = groupIdByName(groupName);
                                        if ( groupId == null ) {
                                            Log.warn(`Group with name '${groupName}' in resource '${resourceRow.name}' not matched, will skip.`);
                                        }
                                        return groupId;
                                    })
                                    .filter(groupId => groupId != null)
                                let r_groupIds = groupIds2;

                                // All other
                                let r_address = resourceRow.addressValue;
                                let r_alias = resourceRow.alias;
                                let r_id = resourceRow.id;
                                let r_isActive = resourceRow.isActive;
                                let r_isBrowserShortcutEnabled = (resourceRow.isBrowserShortcutEnabled === "true" || resourceRow.isBrowserShortcutEnabled === "TRUE" || resourceRow.isBrowserShortcutEnabled == undefined || resourceRow.isBrowserShortcutEnabled === true);
                                let r_isVisible = (resourceRow.isVisible === "true" || resourceRow.isVisible === "TRUE" || resourceRow.isVisible == undefined || resourceRow.isVisible === true);
                                let r_name = resourceRow.name;
                                let r_protocols = resourceRow._protocol;
                                let r_remoteNetworkId = remoteNetworkIdByName(resourceRow.remoteNetworkLabel);
                                let r_securityPolicyId = securityPolicyIdByName(resourceRow.securityPolicyLabel);

                                // Send to client
                                let result = await client.updateResource(r_addedGroupIds, r_address, r_alias, r_groupIds, r_id, r_isActive, r_isBrowserShortcutEnabled, r_isVisible, r_name, r_protocols, r_remoteNetworkId, r_removedGroupIds, r_securityPolicyId);
                                if ( result.ok !== true || result.error != null ) {
                                    Log.error(`Error syncing resource: '${resourceRow.name}'(${resourceRow.importId}): ${result.error}`);
                                }
                                delete resourceRow._protocol;
                                break;
                            default:
                                // NoOp
                                break;
                        }
                    }
                    break;
                case "Device":
                    let results = await client.setDeviceTrustBulk(recordsToImport, (d) => d.importId || d.id);
                    for ( let x = 0; x < recordsToImport.length; x++ ) {
                        let result = results[x],
                            record = recordsToImport[x];
                        if ( result.ok !== true ) {
                            record.importAction = ImportAction.ERROR;
                            record.importId = result.error;
                        }
                        else {
                            record.importId = results[x].entity.id;
                            record.isTrusted = results[x].entity.isTrusted;
                        }
                    }
                    /*
                    // -- Previous code below does one update query at a time
                    for ( let deviceRow of recordsToImport ) {
                        const idToUpdate = deviceRow.importId || deviceRow.id,
                              deviceUpdateResult = await client.setDeviceTrust(idToUpdate, deviceRow.isTrusted);
                        deviceRow.importId = deviceUpdateResult.id;
                        deviceRow.isTrusted = deviceUpdateResult.isTrusted;
                    }*/
                    break;
                default:
                    // NoOp
                    break;
            }
        }
        // Write results
        options.outputFile = options.outputFile || genFileNameFromNetworkName(options.accountName);
        let outputDir = `./output/${options.outputFile}_import`;
        await Deno.mkdir(outputDir, {recursive: true});
        await writeImportResults(mergeMap, `${outputDir}/${options.outputFile}_import.xlsx`);
        Log.success(`Import to '${networkName}' completed. Results written to: '${outputDir}/${options.outputFile}_import.xlsx'.`)
        return;
    });