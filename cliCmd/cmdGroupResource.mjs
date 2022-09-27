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

export function getAddGroupToResourceCommands(name) {
    let cmd = null;
    switch (name) {
        case "resource":
            cmd = new Command()
                .arguments("<resourceNameOrId:string> [groupNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add groups to a resource`)
                .action(async (options, resourceNameOrId, ...groupNamesOrIds) => {

                    if (!groupNamesOrIds){
                        throw new Error(`Group names or IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let resourceId = resourceNameOrId
                    if (!resourceNameOrId.startsWith(TwingateApiClient.IdPrefixes.Resource)) {
                        resourceId = await client.lookupResourceByName(resourceId);
                        if (resourceId == null) {
                            throw new Error(`Could not find resource: '${resourceNameOrId}'`)
                        }
                    }

                    let groupIds = groupNamesOrIds
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



                    let res = await client.addGroupToResource(resourceId, groupIds)

                    let groupStr = ``
                    let result = res.groups.edges.map(function(obj) {return obj.node.id})
                    for (const element of groupIds) {
                        if (result.includes(element)){
                            groupStr += `'${res.groups.edges.find(o => o.node.id === element).node.name}: ${element}' `
                        }
                    }
                    groupStr = groupStr.substring(0, groupStr.length - 1);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Added groups ${groupStr} to ${name} '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }
    return cmd;
}


export function getRemoveGroupFromResourceCommands(name) {
    let cmd = null;
    switch (name) {
        case "resource":
            cmd = new Command()
                .arguments("<resourceNameOrId:string> [groupNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove groups from a resource`)
                .action(async (options, resourceNameOrId, ...groupNamesOrIds) => {

                    if (!groupNamesOrIds){
                        throw new Error(`Group names or IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let resourceId = resourceNameOrId
                    if (!resourceNameOrId.startsWith(TwingateApiClient.IdPrefixes.Resource)) {
                        resourceId = await client.lookupResourceByName(resourceId);
                        if (resourceId == null) {
                            throw new Error(`Could not find resource: '${resourceNameOrId}'`)
                        }
                    }
                    let groups = {}
                    for ( let x = 0; x < groupNamesOrIds.length; x++ ) {
                        let groupId = ""
                        let groupName = ""
                        if (!groupNamesOrIds[x].startsWith(TwingateApiClient.IdPrefixes.Group)) {
                            groupId = await client.lookupGroupByName(groupNamesOrIds[x]);
                            if (groupId == null) {
                                throw new Error(`Could not find group: '${groupNamesOrIds[x]}'`)
                            } else {
                                groups[groupId] = groupNamesOrIds[x]
                            }
                        } else {
                            groupName = await client.fetchGroupById(groupNamesOrIds[x])
                            groups[groupNamesOrIds[x]] = groupName.name
                        }
                    }



                    let res = await client.removeGroupFromResource(resourceId, Object.keys(groups))

                    let groupStr = ``
                    for (const group in groups) {
                        groupStr += `'${groups[group]}: ${group}' `
                    }
                    groupStr = groupStr.substring(0, groupStr.length - 1)

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Removed groups ${groupStr} from ${name} '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }
    return cmd;
}



export function getAddResourceToGroupCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<groupNameOrId:string> [resourceNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add resources to a group`)
                .action(async (options, groupNameOrId, ...resourceNamesOrIds) => {

                    if (!resourceNamesOrIds){
                        throw new Error(`Resource names or IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let groupId = groupNameOrId
                    if (!groupNameOrId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                        groupId = await client.lookupGroupByName(groupId);
                        if (groupId == null) {
                            throw new Error(`Could not find group: '${groupNameOrId}'`)
                        }
                    }

                    let resourceIds = resourceNamesOrIds
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


                    let res = await client.addResourceToGroup(groupId, resourceIds)

                    let resourceStr = ``
                    let result = res.resources.edges.map(function(obj) {return obj.node.id})
                    for (const element of resourceIds) {
                        if (result.includes(element)){
                            resourceStr += `'${res.resources.edges.find(o => o.node.id === element).node.name}: ${element}' `
                        }
                    }
                    resourceStr = resourceStr.substring(0, resourceStr.length - 1);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Added resources ${resourceStr} to ${name} '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }
    return cmd;
}



export function getRemoveResourceFromGroupCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<groupNameOrId:string> [resourceNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add resources to a group`)
                .action(async (options, groupNameOrId, ...resourceNamesOrIds) => {

                    if (!resourceNamesOrIds){
                        throw new Error(`Resource names or IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let groupId = groupNameOrId
                    if (!groupNameOrId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                        groupId = await client.lookupGroupByName(groupId);
                        if (groupId == null) {
                            throw new Error(`Could not find group: '${groupNameOrId}'`)
                        }
                    }

                    let resources = {}
                    for ( let x = 0; x < resourceNamesOrIds.length; x++ ) {
                        let resourceId = ""
                        let resourceName = ""
                        if (!resourceNamesOrIds[x].startsWith(TwingateApiClient.IdPrefixes.Resource)) {
                            resourceId = await client.lookupResourceByName(resourceNamesOrIds[x]);
                            if (resourceId == null) {
                                throw new Error(`Could not find resource: '${resourceNamesOrIds[x]}'`)
                            } else {
                                resources[resourceId] = resourceNamesOrIds[x]
                            }
                        } else {
                            resourceName = await client.fetchResourceById(resourceNamesOrIds[x])
                            resources[resourceNamesOrIds[x]] = resourceName.name
                        }
                    }


                    let res = await client.removeResourceFromGroup(groupId, Object.keys(resources))

                    //@todo log should return both name and id of the removed resource, need lookUpResourceById for this
                    let resourceStr = ``
                    for (const resource in resources){
                        resourceStr += `'${resources[resource]}: ${resource}' `
                    }
                    resourceStr = resourceStr.substring(0, resourceStr.length - 1)

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Removed resources ${resourceStr} from ${name} '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }
    return cmd;
}
