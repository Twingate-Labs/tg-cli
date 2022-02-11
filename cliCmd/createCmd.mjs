import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {
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
                .action(async (options, remoteNetworkNameOrId, resourceName, resourceAddress, groupNamesOrIds) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

                    // Lookup id from name if we need to
                    let remoteNetworkId = remoteNetworkNameOrId;
                    if (!remoteNetworkNameOrId.startsWith(TwingateApiClient.IdPrefixes.RemoteNetwork)) {
                        remoteNetworkId = await client.lookupRemoteNetworkByName(remoteNetworkNameOrId);
                        if (remoteNetworkId == null) throw new Error(`Could not find remote network: '${remoteNetwork}'`);
                    }

                    let ports = null;
                    if ( options.protocolRestrictions ) ports = tryProcessPortRestrictionString(options.protocolRestrictions);
                    const policy = ports == null ? "ALLOW_ALL" : "RESTRICTED";
                    let protocols = {
                        allowIcmp: options.allowIcmp,
                        tcp: { policy, ports },
                        udp: { policy, ports }
                    };

                    // Create resource
                    let res = client.createResource(resourceName, resourceAddress, remoteNetworkId, protocols)

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `New ${res.name} named '${res.name}' created with id '${res.id}' in network '${res.remoteNetwork}'`;
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
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

                    // Lookup id from name if we need to
                    let remoteNetworkId = remoteNetworkNameOrId;
                    if (!remoteNetworkNameOrId.startsWith(TwingateApiClient.IdPrefixes.RemoteNetwork)) {
                        remoteNetworkId = await client.lookupRemoteNetworkByName(remoteNetworkNameOrId);
                        if (remoteNetworkId == null) throw new Error(`Could not find remote network: '${remoteNetwork}'`);
                    }

                    // Create connector
                    let res = await client.createConnector(remoteNetworkId);
                    res.remoteNetwork = remoteNetworkNameOrId;

                    // If name was specified, update the connector
                    if (typeof connectorName == "string" && connectorName.length > 0) {
                        try {
                            res = await client.setConnectorName(res.id, connectorName);
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
                            let msg = `New ${res.name} named '${res.name}' created with id '${res.id}' in network '${res.remoteNetwork}'`;
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
                .arguments("<name:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a ${name}`)
                .action(async (options, groupName) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.createGroup(groupName);
                    res.name = groupName;

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`New ${name} named '${res.name}' created with id '${res.id}'.`);
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
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.createRemoteNetwork(remoteNetworkName);
                    res.name = remoteNetworkName;
                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`New ${name} named '${res.name}' created with id '${res.id}'.`);
                            break;
                    }

                });
            break;
    }
    return cmd;
}


