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

export function getGroupFromResourceCommands(name) {
    let cmd = null;
    switch (name) {
        case "resource":
            cmd = new Command()
                .arguments("<resourceId:string>")
                .description(`Get groups from a resource`)
                .hidden()
                .action(async (options, resourceId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

                    let query = client.getRootNodePagedQuery("ResourceGroups", "resource", "groups", ["id", "name"])
                    let results = await client.fetchAllRootNodePages(query, {id: resourceId});
                    console.dir(JSON.stringify(results));
                });
            break;
    }
    return cmd;
}


export function getResourceFromGroupCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<groupId:string>")
                .description(`Get resources from a group`)
                .hidden()
                .action(async (options, groupId) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let query = client.getRootNodePagedQuery("GroupResources", "group", "resources", ["id", "name"])
                    let results = await client.fetchAllRootNodePages(query, {id: groupId});
                    console.dir(JSON.stringify(results));
                });
            break;
    }
    return cmd;
}
