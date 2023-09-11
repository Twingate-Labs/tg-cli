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

export function getRemoveResourceFromServiceAccountCommands(name) {
    let cmd = null;
    switch (name) {
        case "service":
            cmd = new Command()
                .arguments("<serviceAccountId:string> [resourceNamesOrIds...:string]")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Remove resources from a service`)
                .action(async (options, serviceAccountId, ...resourceNamesOrIds) => {

                    if (!resourceNamesOrIds){
                        throw new Error(`Resource names or IDs are not defined.`)
                    }

                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

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
                    
                    let res = await client.removeResourceFromServiceAccount(serviceAccountId, resourceIds);                                        
                    
                    let resourceStr = ``
                    let result = res.resources.edges.map(function(obj) {return obj.node.id})                
                    
                    for (const element of resourceIds) {                        
                        if (result.includes(element)===false){                            
                            resourceStr += element + ", "
                        }
                    }
                    resourceStr = resourceStr.substring(0, resourceStr.length - 2);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg =  `Removed resources ${resourceStr} from ${name} '${res.name}: ${res.id}'`
                            Log.success(msg);
                            break;
                    }
                });
            break;
    }
    return cmd;
}


