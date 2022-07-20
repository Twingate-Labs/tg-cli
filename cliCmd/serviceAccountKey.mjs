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

export function getServiceAccountKeyCreateCommands(name) {
    let cmd = null;
    switch (name) {
        case "service":
            cmd = new Command()
                .arguments("<serviceAccountId:string> <keyName:string> <expirationTimeInDays:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Create a service account key`)
                .action(async (options, serviceAccountId, keyName, expirationTime) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let res = await client.serviceAccountKeyCreate(serviceAccountId, keyName, Number(expirationTime));

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg =  `Created key '${res.entity.name}: ${res.entity.id}' at ${name} '${res.entity.serviceAccount.name}: ${res.entity.serviceAccount.id}'`
                            if (res.token) msg += ` with token object:`
                            Log.success(msg);
                            if (res.token) {
                                console.log(`${res.token}`);
                            }
                            break;
                    }
                });
            break;
    }
    return cmd;
}


