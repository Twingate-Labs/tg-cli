import {genFileNameFromNetworkName, loadNetworkAndApiKey} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import XLSX from "https://cdn.esm.sh/xlsx";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";


const optionToSheetMap = {
    groups: "Group",
    remoteNetworks: "RemoteNetwork",
    resources: "Resource"
}

async function fetchDataForImport(client, options, wb) {
    let typesToFetch = [],
        sheetNames = wb.SheetNames;
    for (const [optionName, schemaName ] of Object.entries(optionToSheetMap) ) {
        // TODO: For now we import everything
        options[optionName] = true;

        if ( options[optionName] === true ) {
            if ( !sheetNames.includes(schemaName) ) {
                throw new Error(`Cannot import remote networks because the Excel file is missing a sheet named '${schemaName}`);
            }
            typesToFetch.push(schemaName);
        }
    }

    if ( typesToFetch.length === 0 ) {
        throw new Error(`Cannot import remote networks because the Excel file is missing a sheet named '${schemaName}`);
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

const portTestRegEx = /^[0-9]+$/.compile();
function tryProcessPortRestrictionString(restrictions) {
    // 443, 8080-8090
    const validatePortNumber = (port) => {
        if ( !portTestRegEx.test(port) ) throw new Error(`Invalid port: ${port}`);
        let portNum = Number(port);
        if ( portNum < 1 || portNum > 65535 ) throw new Error(`Invalid port range: ${portNum}`);
        return portNum;
    }
    const singleRestrictionToObj = (restriction) => {
        restriction = restriction.trim();
        let ports = restriction.split('-');
        if ( ports.length > 2 ) throw new Error(`Invalid port restriction: ${restriction}`);
        let start = validatePortNumber(ports[0]);
        let end = ports.length === 2 ? validatePortNumber(ports[1]) : start;
        if ( start > end ) throw new Error(`Invalid port restriction - end greater than start: ${restriction}`);
        return {start,end};
    };
    return restrictions.split(",").map(singleRestrictionToObj);
}

function tryResourceRowToProtocols(resourceRow) {
    if ( typeof resourceRow.protocolsAllowIcmp === "string") {
        resourceRow.protocolsAllowIcmp = resourceRow.protocolsAllowIcmp.trim().toUpperCase();
        resourceRow.protocolsAllowIcmp = ["YES", "Y", "TRUE"].includes(resourceRow.protocolsAllowIcmp);
    }
    if ( resourceRow.protocolsTcpPolicy === "ALLOW_ALL" && resourceRow.protocolsUdpPolicy === "ALLOW_ALL" && resourceRow.protocolsAllowIcmp === true) {
        return null;
    }

    let protocols = {
        allowIcmp: resourceRow.protocolsAllowIcmp,
        tcp: {
            policy: resourceRow.protocolsTcpPolicy,
            ports: tryProcessPortRestrictionString(resourceRow.protocolsTcpPorts)
        },
        udp: {
            policy: resourceRow.protocolsUdpPolicy,
            ports: tryProcessPortRestrictionString(resourceRow.protocolsUdpPorts)
        }
    }
    return protocols
}
export const importCmd = new Command()
    .option("-f, --file <string>", "Path to Excel file to import from")
    .option("-n, --remote-networks", "Include Remote Networks")
    .option("-r, --resources", "Include Resources")
    .option("-g, --groups", "Include Groups")
    .description("Import from excel file to a Twingate account")
    .action(async (options) => {
        const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
        options.accountName = networkName;
        let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

        let fileData = await Deno.readFile(options.file);
        let wb = XLSX.read(fileData,{type:'array', cellDates: true});

        const {typesToFetch, allNodes} = await fetchDataForImport(client, options, wb);

        let nodeLabelIdMap = {
            RemoteNetwork: {},
            Resource: {},
            Group: {}
        }

        let nodeIdMap = Object.fromEntries([
            ...allNodes.RemoteNetwork,
            ...allNodes.Resource,
            ...allNodes.Group
        ].map(n => [n.id, n]));

        // Pre-process groups
        for ( let node of allNodes.Group) {
            if ( nodeLabelIdMap.Group[node.name] != null ) {
                throw new Error(`Group with duplicate name found: '${node.name}' - Ids: ['${nodeLabelIdMap.Group[node.name]}', '${node.id}']`);
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
                if (node.resourceNames.length !== (new Set(node.resourceNames)).size) {
                    throw new Error(`Remote network '${node.name}' contains resources with duplicate names`);
                }
            }
            nodeLabelIdMap.RemoteNetwork[node.name] = node.id;
        }

        // Pre-process resources
        for ( let node of allNodes.Resource) {
            node.remoteNetwork = nodeIdMap[node.remoteNetwork.id].name;
        }

        // Map of old id to new id
        let mergeMap = {};
        let importCount = 0;
        for ( let schemaName of typesToFetch ) {
            let sheetData = XLSX.utils.sheet_to_json(wb.Sheets[schemaName]);
            mergeMap[schemaName] = sheetData;
            switch (schemaName) {
                case "Group":
                    for ( let groupRow of sheetData) {
                        // 1. Skip non-manual groups
                        if ( groupRow.type !== "Manual" ) {
                            Log.info(`Group '${groupRow.name}' will be skipped because it is of type '${groupRow.type}'`);
                            groupRow["importAction"] = "SKIP";
                            groupRow["importId"] = "";
                            continue;
                        }

                        // 2. Check if Group exists
                        let existingId = nodeLabelIdMap.Group[groupRow.name];
                        if ( existingId != null ) {
                            Log.info(`Group with same name already exists, will skip: '${groupRow.name}'`);
                            groupRow["importAction"] = "SKIP";
                            groupRow["importId"] = existingId;
                            continue;
                        }

                        Log.info(`Group will be created: '${groupRow.name}'`);
                        groupRow["importAction"] = "CREATE";
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
                            remoteNetworkRow["importAction"] = "SKIP";
                            remoteNetworkRow["importId"] = existingId;
                            continue;
                        }

                        Log.info(`Remote Network will be created: '${remoteNetworkRow.name}'`);
                        remoteNetworkRow["importAction"] = "CREATE";
                        remoteNetworkRow["importId"] = null;
                        importCount++;
                    }
                    break;
                case "Resource":
                    for ( let resourceRow of sheetData ) {
                        let existingRemoteNetwork = nodeIdMap[nodeLabelIdMap.RemoteNetwork[resourceRow.remoteNetworkLabel]];
                        if ( existingRemoteNetwork != null && existingRemoteNetwork.resourceNames.includes(resourceRow.name) ) {
                            Log.info(`Resource with same name exists, will skip: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}'`);
                            resourceRow["importAction"] = "SKIP";
                            resourceRow["importId"] = existingRemoteNetwork.resources.filter(r => r.name === resourceRow.name)[0];
                            continue;
                        }
                        if ( typeof resourceRow["addressValue"] !== "string" || resourceRow["addressValue"].length > 255 ) {
                            Log.error(`Resource will be skipped: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}' - Invalid address`);
                            resourceRow["importAction"] = "SKIP";
                            resourceRow["importId"] = null;
                        }
                        resourceRow["_protocol"] = tryResourceRowToProtocols(resourceRow);

                        Log.info(`Resource will be created: '${resourceRow.name}' in Remote Network '${resourceRow.remoteNetworkLabel}'`);
                        resourceRow["importAction"] = "CREATE";
                        resourceRow["importId"] = null;
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
        if ( !(await Confirm.prompt("Please confirm to continue?")) ) return;

        // Pass through all records to import and import them
        for ( const [schemaName, importData] of Object.entries(mergeMap)) {
            const recordsToImport = importData.filter(row => row.importAction === "CREATE");
            Log.info(`Importing ${recordsToImport.length} record(s) as ${schemaName}s`);
            switch (schemaName) {
                case "Group":
                    for ( let groupRow of recordsToImport ) {
                        let newGroup = await client.createGroup(groupRow.name);
                        groupRow.importId = newGroup.id;
                        nodeIdMap[newGroup.id] = {...newGroup, _imported: true};
                        allNodes.Group.push(nodeIdMap[newGroup.id]);
                        nodeLabelIdMap.Group[groupRow.name] = newGroup.id;
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
                        let remoteNetwork = nodeIdMap[nodeLabelIdMap.RemoteNetwork[resourceRow.remoteNetworkLabel]];
                        let groupIds = resourceRow.groups
                            .split(",")
                            .map(r => r.trim())
                            .map(groupName => {
                                let groupId = nodeLabelIdMap.Group[groupName];
                                if ( groupId == null ) {
                                    Log.warn(`Group with name '${groupName}' in resource '${resourceRow.name}' not matched, will skip.`);
                                }
                                return groupId;
                            })
                            .filter(groupId => groupId != null)
                        let newResource = await client.createResource(resourceRow.name, resourceRow.addressValue, remoteNetwork.id, resourceRow._protocol, groupIds);
                        resourceRow.importId = newResource.id;
                        delete resourceRow._protocol;
                        remoteNetwork.resourceNames.push(resourceRow.name);
                        remoteNetwork.resources.push({name: resourceRow.name, _imported: true});
                    }
                    break;
                default:
                    // NoOp
                    break;
            }
        }
        // Write results
        let outputFilename = `importResults-${genFileNameFromNetworkName(options.accountName)}`;
        await writeImportResults(mergeMap, outputFilename);
        // Log completion
        Log.success(`Import to '${networkName}' completed. Results written to: '${outputFilename}'.`);
        return;
    });