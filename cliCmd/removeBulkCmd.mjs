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

export function getRemoveBulkCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("[groupIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove ${name}s bulk`)
                .action(async (options, groupIds) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    for ( let x = 0; x < groupIds.length; x++ ) {
                        try {
                            let res = await client.removeGroup(groupIds[x]);
                            switch (options.outputFormat) {
                                case OutputFormat.JSON:
                                    console.log(JSON.stringify(res));
                                    break;
                                default:
                                    Log.success(`Removed ${name}s with id '${groupIds[x]}'`);
                                    break;
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                });
            break;
        case "resource":
            cmd = new Command()
                .arguments("[resourceIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove ${name}s bulk`)
                .action(async (options, resourceIds) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    for ( let x = 0; x < resourceIds.length; x++ ) {
                        try {
                            let res = await client.removeResource(resourceIds[x]);
                            switch (options.outputFormat) {
                                case OutputFormat.JSON:
                                    console.log(JSON.stringify(res));
                                    break;
                                default:
                                    Log.success(`Removed ${name}s with id '${resourceIds[x]}'`);
                                    break;
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }

                });
            break
    }

    return cmd;
}


