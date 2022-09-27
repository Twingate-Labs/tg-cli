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

export function getAddUserToGroupCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<groupNameOrId:string> [userIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add users to a group`)
                .action(async (options, groupNameOrId, ...userIds) => {

                    if (!userIds){
                        throw new Error(`User IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let groupId = groupNameOrId
                    if (!groupId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                        groupId = await client.lookupGroupByName(groupId);
                        if (groupId == null) {
                            throw new Error(`Could not find group: '${groupNameOrId}'`)
                        }
                    }

                    let res = await client.addUserToGroup(groupId, userIds);

                    let userStr = ``
                    let result = res.users.edges.map(function(obj) {return obj.node.id})
                    for (const element of userIds) {
                        if (result.includes(element)){
                            userStr += `'${res.users.edges.find(o => o.node.id === element).node.email}: ${element}' `
                        }
                    }
                    userStr = userStr.substring(0, userStr.length - 1);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Added users ${userStr} to ${name} '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }

    return cmd;
}


export function getRemoveUserFromGroupCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<groupNameOrId:string> [userIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove users to a group`)
                .action(async (options, groupNameOrId, ...userIds) => {

                    if (!userIds){
                        throw new Error(`User IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let groupId = groupNameOrId
                    if (!groupId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                        groupId = await client.lookupGroupByName(groupId);
                        if (groupId == null) {
                            throw new Error(`Could not find group: '${groupNameOrId}'`)
                        }
                    }

                    let users = {}
                    for ( let x = 0; x < userIds.length; x++ ) {
                        let userId = userIds[x]
                        let userEmail = await client.fetchUserById(userId)
                        users[userIds[x]] = userEmail.email
                    }


                    let res = await client.removeUserFromGroup(groupId, userIds);

                    let userStr = ``
                    for (const user in users){
                        userStr += `'${users[user]}: ${user}' `
                    }

                    userStr = userStr.substring(0, userStr.length - 1)


                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Removed users ${userStr} from ${name} '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }

    return cmd;
}
