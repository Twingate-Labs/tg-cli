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

export function getRemoveCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<id:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove a ${name}`)
                .action(async (options, groupId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.removeGroup(groupId);
                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`Removed ${name} with id '${groupId}'.`);
                            break;
                    }

                });
            break;
        case "service_account":
            cmd = new Command()
                .arguments("<id:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove a ${name}`)
                .action(async (options, serviceAccountId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.removeServiceAccount(serviceAccountId);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`Removed ${name} with id '${serviceAccountId}'.`);
                            break;
                    }

                });
            break;
        case "resource":
            cmd = new Command()
                .arguments("<id:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove a ${name}`)
                .action(async (options, resourceId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.removeResource(resourceId);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`Removed ${name} with id '${resourceId}'.`);
                            break;
                    }

                });
            break
    }

    return cmd;
}


