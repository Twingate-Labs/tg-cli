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

export function getGenerateConnectorToken(name) {
    let cmd = null;
    switch (name) {
        case "connector":
            cmd = new Command()
                .arguments("<connectorId:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Regenerate Connector Token`)
                .action(async (options, connectorId) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let res = await client.generateConnectorTokens(connectorId);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Connector with ID '${connectorId}' token generated, the previous token is now revoked.`;
                            if (res) msg += ` tokens:`
                            Log.success(msg);
                            if (res) {
                                console.log(`ACCESS_TOKEN=${res.accessToken}`);
                                console.log(`REFRESH_TOKEN=${res.refreshToken}`);
                            }
                            break;
                    }
                });
            break;
    }
    return cmd;
}


