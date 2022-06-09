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

export function getAddGroupToResourceCommands(name) {
    let cmd = null;
    switch (name) {
        case "resource":
            cmd = new Command()
                .arguments("<resourceId:string> [groupNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add groups to a resource`)
                .action(async (options, resourceId, groupNamesOrId) => {

                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

                    let groupIds = ( Array.isArray(groupNamesOrId) ? groupNamesOrId.join("").replace("[", "").replace("]", "").split(",") : [groupNamesOrId])
                    for ( let x = 0; x < groupIds.length; x++ ) {
                        let groupId = groupIds[x]
                        if (!groupId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                            groupId = await client.lookupGroupByName(groupId);
                            if (groupId == null) {
                                throw new Error(`Could not find group: '${groupId}'`)
                            } else {
                                groupIds[x] = groupId
                            }
                        }
                    }

                    let res = await client.addGroupToResource(resourceId, groupIds)

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Added groups ${groupNamesOrId} to resource ${resourceId}`;
                            Log.success(msg);
                            break;
                    }
                });
            break;
        case "group":
            cmd = new Command()
                .arguments("<resourceId:string> [groupNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add groups to a resource`)
                .action(async (options, resourceId, groupNamesOrId) => {

                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

                    let groupIds = ( Array.isArray(groupNamesOrId) ? groupNamesOrId.join("").replace("[", "").replace("]", "").split(",") : [groupNamesOrId])
                    for ( let x = 0; x < groupIds.length; x++ ) {
                        let groupId = groupIds[x]
                        if (!groupId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                            groupId = await client.lookupGroupByName(groupId);
                            if (groupId == null) {
                                throw new Error(`Could not find group: '${groupId}'`)
                            } else {
                                groupIds[x] = groupId
                            }
                        }
                    }

                    let res = await client.addGroupToResource(resourceId, groupIds)

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Added groups ${groupNamesOrId} to resource ${resourceId}`;
                            Log.success(msg);
                            break;
                    }
                });
            break;

    }
    return cmd;
}


