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

export function getAddResourceToSericeAccountCommands(name) {
    let cmd = null;
    switch (name) {
        case "service_account":
            cmd = new Command()
                .arguments("<serviceAccountId:string> [resourceId...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add resources to service account`)
                .action(async (options, serviceAccountId, resourceId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let resourceIds = ( Array.isArray(resourceId) ? resourceId.join("").replace("[", "").replace("]", "").split(",") : [resourceId])
                    let res = await client.addResourceToServiceAccount(serviceAccountId, resourceIds);
                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`Add resources '${resourceIds}' to service account '${serviceAccountId}'.`);
                            break;
                    }
                });
            break;
    }
    return cmd;
}


