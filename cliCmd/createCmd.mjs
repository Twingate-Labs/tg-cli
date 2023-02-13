import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {
    loadClientForCLI,
    loadNetworkAndApiKey,
    tryProcessPortRestrictionString
} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";


const OutputFormat = new EnumType(["text", "json"]);
OutputFormat.TEXT = "text";
OutputFormat.JSON = "json";

export function getCreateCommand(name) {
    let cmd = null;
    switch (name) {
        case "resource":
            cmd = new Command()
                .type("format", OutputFormat)
                .arguments("<remoteNetworkNameOrId:string> <name:string> <address:string> [groupNamesOrIds...:string]")
                .option("-p, --icmp [boolean]", "Allow ping", {default: true})
                .option("-r, --protocol-restrictions [string]", "Protocol Restrictions")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a ${name}`)
                .action(async (options, remoteNetworkNameOrId, resourceName, resourceAddress, ...groupNameOrIds) => {

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    // Lookup id from name if we need to
                    let remoteNetworkId = remoteNetworkNameOrId;
                    if (!remoteNetworkNameOrId.startsWith(TwingateApiClient.IdPrefixes.RemoteNetwork)) {
                        remoteNetworkId = await client.lookupRemoteNetworkByName(remoteNetworkNameOrId);
                        if (remoteNetworkId == null) throw new Error(`Could not find remote network: '${remoteNetworkNameOrId}'`);
                    }
                    let groupIds = groupNameOrIds
                    if (groupIds){
                        for ( let x = 0; x < groupIds.length; x++ ) {
                            let groupId = groupIds[x]
                            if (!groupId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                                groupId = await client.lookupGroupByName(groupId);
                                if (groupId == null) {
                                    throw new Error(`Could not find group: '${groupIds[x]}'`)
                                } else {
                                    groupIds[x] = groupId
                                }
                            }
                        }
                    }


                    let ports = null;
                    if ( options.protocolRestrictions ) ports = tryProcessPortRestrictionString(options.protocolRestrictions);
                    const policy = ports == null ? "ALLOW_ALL" : "RESTRICTED";
                    let protocols = {
                        allowIcmp: options.allowIcmp || true,
                        tcp: { policy, ports},
                        udp: { policy, ports}
                    };
                    if (ports == null){
                        protocols = {
                            allowIcmp: options.allowIcmp || true,
                            tcp: { policy },
                            udp: { policy }
                    }}

                    // Create resource
                    let res = await client.createResource(resourceName, resourceAddress, remoteNetworkId, protocols, groupIds)

                    let groupStr = ``
                    if (groupIds){
                        for (const element of res.groups.edges) {
                            groupStr += `'${element.node.name}: ${element.node.id}' `
                        }
                    }


                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `New ${name} with address '${res.address.value}' named '${res.name}' created with id '${res.id}' in network '${res.remoteNetwork.name}'`
                            if (groupIds) msg += ` with added groups ${groupStr}`
                            Log.success(msg);
                            break;
                    }
                });
            break;
        case "connector":
            cmd = new Command()
                .type("format", OutputFormat)
                .arguments("<remoteNetworkNameOrId:string> [name:string]")
                .option("-t, --generate-tokens [boolean]", "Generate tokens", {
                    default: true
                })
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a ${name}`)
                .action(async (options, remoteNetworkNameOrId, connectorName) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    // Lookup id from name if we need to
                    let remoteNetworkId = remoteNetworkNameOrId;
                    if (!remoteNetworkNameOrId.startsWith(TwingateApiClient.IdPrefixes.RemoteNetwork)) {
                        remoteNetworkId = await client.lookupRemoteNetworkByName(remoteNetworkNameOrId);
                        if (remoteNetworkId == null) throw new Error(`Could not find remote network: '${remoteNetwork}'`);
                    }

                    // Create connector
                    let res = await client.createConnector(remoteNetworkId);
                    // If name was specified, update the connector
                    if (typeof connectorName == "string" && connectorName.length > 0) {
                        try {
                            res.setName = await client.setConnectorName(res.id, connectorName);
                        } catch (e) {
                            Log.error(e);
                        }
                    }

                    // Generate tokens if we need to
                    if (options.generateTokens) {
                        try {
                            res.tokens = await client.generateConnectorTokens(res.id);
                        } catch (e) {
                            Log.error(e);
                        }
                    }

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `New ${name} named '${res.name}' created with id '${res.id}' in network '${res.remoteNetwork.name}'`;
                            if (res.tokens) msg += ` with tokens:`
                            Log.success(msg);
                            if (res.tokens) {
                                console.log(`ACCESS_TOKEN=${res.tokens.accessToken}`);
                                console.log(`REFRESH_TOKEN=${res.tokens.refreshToken}`);
                            }
                            break;
                    }
                });
            break;

        case "group":
            cmd = new Command()
                .arguments("<name:string> [UserIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a ${name}`)
                .action(async (options, groupName, ...userIds) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;
                    let res = await client.createGroup(groupName, [], userIds)

                    let userStr = ``
                    if (userIds){
                        for (const element of res.users.edges) {
                            userStr += `'${element.node.email}: ${element.node.id}' `
                        }
                    }

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `New ${name} named '${res.name}' created with id '${res.id}'`
                            if (userIds) msg += ` with added users ${userStr}`
                            Log.success(msg);
                            break;
                    }

                });
            break;
        case "network":
            cmd = new Command()
                .arguments("<name:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a ${name}`)
                .action(async (options, remoteNetworkName) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;
                    let res = await client.createRemoteNetwork(remoteNetworkName);
                    res.name = remoteNetworkName;
                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`New ${name} named '${res.name}' created with id '${res.id}'`);
                            break;
                    }

                });
            break;
        case "service":
            cmd = new Command()
                .arguments("<name:string> [resourceNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a ${name}`)
                .action(async (options, serviceAccountName, ...resourceNamesOrIds) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let resourceIds = resourceNamesOrIds
                    if (resourceIds){
                        for ( let x = 0; x < resourceIds.length; x++ ) {
                            let resourceId = resourceIds[x]
                            if (!resourceId.startsWith(TwingateApiClient.IdPrefixes.Resource)) {
                                resourceId = await client.lookupResourceByName(resourceId);
                                if (resourceId == null) {
                                    throw new Error(`Could not find resource: '${resourceIds[x]}'`)
                                } else {
                                    resourceIds[x] = resourceId
                                }
                            }
                        }
                    }

                    let res = await client.createServiceAccount(serviceAccountName, resourceIds);

                    let resourceStr = ``
                    if (resourceNamesOrIds){
                        for (const element of res.resources.edges) {
                            resourceStr += `'${element.node.name}: ${element.node.id}' `
                        }
                    }

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `New ${name} named '${res.name}' created with id '${res.id}'`;
                            if (resourceIds) msg += ` with added resources ${resourceStr}`
                            Log.success(msg);
                            break;
                    }

                });
            break
    }
    return cmd;
}


