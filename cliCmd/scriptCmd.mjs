import {loadNetworkAndApiKey} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {exec} from "../crypto.mjs";


const optionToNameMap = {
    groups: "Groups",
    remoteNetworks: "Remote Networks",
    resources: "Resources"
}

function isEmpty(s) {
    return s == null || (typeof s == "string" && s.trim() === "")
}

function isNotEmpty(s) {
    s = s || "";
    return s.trim() !== "";
}

export const scriptCmd = new Command()
    .description("Script command")
    .option("-f, --file <string>", "Path to Excel file source", {
        required: true
    })
    .hidden()
    .action(async (options) => {

        let fileData = null;
        try {
            fileData = await Deno.readFile(options.file);
            Log.info(`Scripting from file: '${Colors.italic(options.file)}'`);
        }
        catch (e) {
            Log.error(`Could not read file: ${options.file}`);
            Log.exception(e);
            return;
        }

        let wb = XLSX.read(fileData,{type:'array', cellDates: true});
        let sheetData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

        const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
        options.accountName = networkName;

        let client = new TwingateApiClient(networkName, apiKey, {logger: Log}),
            x = 0,
            remoteNetworkMap = {}
        ;
        for ( let row of sheetData ) {
            let remoteNetworkName = (row["Remote Network"] || "").trim();
            if ( isNotEmpty(remoteNetworkName) && isEmpty(row["Remote Network Id"]) ) {
                if ( remoteNetworkMap[remoteNetworkName] == null ) {
                    // Create remote network
                    let remoteNetwork = await client.createRemoteNetwork(remoteNetworkName);
                    remoteNetworkMap[remoteNetworkName] = remoteNetwork.id;
                }
                row["Remote Network Id"] = remoteNetworkMap[remoteNetworkName];
            }

            let remoteNetworkId = row["Remote Network Id"];

            if ( isEmpty(row["Connector Id"]) ) {
                // Create connector
                let newConnector = await client.createConnector(remoteNetworkId);
                row["Connector Name"] = newConnector.name;
                row["Connector Id"] = newConnector.id;
            }

            if ( isEmpty(row["Access Token"]) || isEmpty(row["Refresh Token"]) ) {
                // Create tokens
                let tokens = await client.generateConnectorTokens(row["Connector Id"]);
                row["Access Token"] = tokens.accessToken;
                row["Refresh Token"] = tokens.refreshToken;
            }

            if ( isNotEmpty(row["SSH User"]) && isNotEmpty(row["SSH Host"]) ) {
                // Deploy connector
                let sshParam = `${row["SSH User"]}@${row["SSH Host"]}`;

                try {
                    let output = await exec(
                        ["ssh", "-o StrictHostKeychecking=no", sshParam, `curl "https://binaries.twingate.com/connector/setup.sh" | sudo TWINGATE_ACCESS_TOKEN="${row["Access Token"]}" TWINGATE_REFRESH_TOKEN="${row["Refresh Token"]}" TWINGATE_LOG_ANALYTICS="v1" TWINGATE_URL="https://${networkName}.twingate.com" bash`],
                    );
                    row["SSH Output"] = output;
                }
                catch (e) {
                    row["SSH Exception"] = e;
                }
            }
        }

        let outputFilename = `scriptResults-${genFileNameFromNetworkName(networkName)}`;
        let scriptResultsWb = XLSX.utils.book_new();
        let ws = XLSX.utils.json_to_sheet(sheetData);
        ws['!autofilter'] = {ref: ws["!ref"]};
        XLSX.utils.book_append_sheet(scriptResultsWb, ws, "ScriptResults");
        await Deno.writeFile(`./${outputFilename}`, new Uint8Array(XLSX.write(scriptResultsWb, {type: "array"})));

        Log.success(`Script all completed.`);
    });


export function genFileNameFromNetworkName(networkName, extension = "xlsx") {
    const
        d = new Date(),
        date = d.toISOString().split('T')[0],
        time = (d.toTimeString().split(' ')[0]).replaceAll(":", "-");
    return `${networkName}-${date}_${time}.${extension}`;
}