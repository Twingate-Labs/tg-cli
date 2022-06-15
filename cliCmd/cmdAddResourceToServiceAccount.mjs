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
                .arguments("<serviceAccountId:string> [resourceNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Add resources to service account`)
                .action(async (options, serviceAccountId, resourceNamesOrIds) => {

                    if (!resourceNamesOrIds){
                        throw new Error(`Resource names or IDs are not defined.`)
                    }

                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

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

                    let res = await client.addResourceToServiceAccount(serviceAccountId, resourceIds);

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
                            let msg =  `Added resources ${resourceStr} to ${name} '${res.name}: ${res.id}'`
                            Log.success(msg);
                            break;
                    }
                });
            break;
    }
    return cmd;
}


