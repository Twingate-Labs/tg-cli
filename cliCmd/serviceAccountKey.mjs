import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {
    loadClientForCLI,
    loadNetworkAndApiKey,
    tryProcessPortRestrictionString
} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import * as base64 from "https://deno.land/std@0.202.0/encoding/base64.ts";


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

export function getServiceAccountKeyDeleteCommands(name) {
    let cmd = null;
    switch (name) {
        case "service":
            cmd = new Command()
                .arguments("<serviceAccountKeyId:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Revoke a service account key`)
                .action(async (options, serviceAccountKeyId) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    if (!serviceAccountKeyId.startsWith("U2Vydmlj")) {
                        serviceAccountKeyId = base64.encode(`ServiceAccountKey:${serviceAccountKeyId}`)
                    }

                    let res = await client.serviceAccountKeyDelete(serviceAccountKeyId);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg =  `Revoked and Deleted Service key '${res.entity.name}: ${res.entity.id}' in Service Account '${res.entity.serviceAccount.name}: ${res.entity.serviceAccount.id}'`
                            Log.success(msg);
                            break;
                    }
                });
            break;
    }
    return cmd;
}
