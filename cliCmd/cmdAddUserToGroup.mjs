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

export function getAddUserToGroupCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<group_id:string> [userIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add users to a group`)
                .action(async (options, groupId, userId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let userIds = ( Array.isArray(userId) ? userId.join("").replace("[", "").replace("]", "").split(",") : [userId])
                    let res = await client.addUserToGroup(groupId, userIds);
                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`Add users '${userIds}' to group '${groupId}'.`);
                            break;
                    }
                });
            break;
        case "user":
            cmd = new Command()
                .arguments("<group_id:string> [userIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add users to a group`)
                .action(async (options, groupId, userId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let userIds = ( Array.isArray(userId) ? userId.join("").replace("[", "").replace("]", "").split(",") : [userId])
                    let res = await client.addUserToGroup(groupId, userIds);
                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            Log.success(`Add users '${userIds}' to group '${groupId}'.`);
                            break;
                    }
                });
            break;
    }

    return cmd;
}


