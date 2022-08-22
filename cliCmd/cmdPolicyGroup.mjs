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

export function setGroupPolicyCommands(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<groupNameOrId:string> <securityPolicyNameOrId:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Set group security policy`)
                .action(async (options, groupNameOrId, policyNameOrId) => {

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let groupId = groupNameOrId
                    if (!groupNameOrId.startsWith(TwingateApiClient.IdPrefixes.Group)) {
                        groupId = await client.lookupGroupByName(groupNameOrId);
                        if (groupId == null) {
                            throw new Error(`Could not find group: '${groupNameOrId}'`)
                        }
                    }

                    let policyId = policyNameOrId
                    if (!policyNameOrId.startsWith(TwingateApiClient.IdPrefixes.SecurityPolicy)){
                        let allSecurityPolicies = await client.fetchAllSecurityPolicies({})
                        let policy = allSecurityPolicies.filter(policy => policy.name === policyNameOrId)[0]
                        if ( policy=== undefined){
                            throw new Error(`Could not find security policy: '${policyNameOrId}'`)
                        }
                        policyId = policy.id
                    }

                    let res = await client.assignGroupToPolicy(groupId, policyId)

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Set ${name} '${res.name}: ${res.id}' security policy to '${res.securityPolicy.name}: ${res.securityPolicy.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }
    return cmd;
}


export function AddGroupToPolicyCommands(name) {
    let cmd = null;
    switch (name) {
        case "policy":
            cmd = new Command()
                .arguments("<securityPolicyNameOrId:string> [groupNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add groups to a security policy. Note: The security policy already assigned to the groups will be replaced`)
                .action(async (options, policyNameOrId, groupNamesOrIds) => {

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

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

                    let policyId = policyNameOrId
                    if (!policyNameOrId.startsWith(TwingateApiClient.IdPrefixes.SecurityPolicy)){
                        let allSecurityPolicies = await client.fetchAllSecurityPolicies({})
                        let policy = allSecurityPolicies.filter(policy => policy.name === policyNameOrId)[0]
                        if ( policy=== undefined){
                            throw new Error(`Could not find security policy: '${policyNameOrId}'`)
                        }
                        policyId = policy.id
                    }

                    let res = await client.addGroupToPolicy(policyId, groupIds)

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
                            let msg = `Added groups ${groupStr} to security policy '${res.name}: ${res.id}'`
                            Log.success(msg)
                            break;
                    }
                });
            break;
    }
    return cmd;
}