import {loadNetworkAndApiKey, sortByTextField} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {Log, LOG_LEVELS} from "../utils/log.js";

import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";

const listCmdConfig = {
    "resource": {
        typeName: "Resource",
        fetchFn: "fetchAllResources",
        listFieldOpts: {
            groups: {
                ignore: true
            }
        }
    },
    "device": {
        typeName: "Device",
        fetchFn: "fetchAllDevices",
        listFieldOpts: {
            users: {ignore: true},
            resources: {ignore: true}
        }
    },
    "group": {
        typeName: "Group",
        fetchFn: "fetchAllGroups",
        listFieldOpts: {
            users: {ignore: true},
            resources: {ignore: true}
        }
    },
    "user": {
        typeName: "User",
        fetchFn: "fetchAllUsers",
        listFieldOpts: {}
    },
    "network": {
        typeName: "RemoteNetwork",
        fetchFn: "fetchAllRemoteNetworks",
        listFieldOpts: {
            resources: {ignore: true}
        }
    },
    "connector": {
        typeName: "Connector",
        fetchFn: "fetchAllConnectors",
        listFieldOpts: {}
    },
    "service": {
        typeName: "ServiceAccount",
        fetchFn: "fetchAllServiceAccounts",
        listFieldOpts: {}
    }
}

const OutputFormat = new EnumType(["table", "json", "csv"]);

export function getListCommand(name) {
    let config = listCmdConfig[name];
    const LogLevelType = new EnumType(Object.keys(LOG_LEVELS));
    return new Command()
        .arguments("")
        .description(`Get list of ${name}s`)
        .type("format", OutputFormat)
        .type("LogLevel", LogLevelType)
        .option("-o, --output-format <format:format>", "Output format", {default: "table"})
        .action(async (options) => {
            const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
            options.accountName = networkName;
            let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

            const configForCli = {
                defaultConnectionFields: "LABEL_FIELD",
                fieldOpts: {
                    defaultObjectFieldSet: [TwingateApiClient.FieldSet.LABEL],
                    ...config.listFieldOpts
                },
                joinConnectionFields: (connections) => {
                    let s = connections.join(", ");
                    return s.length > 50 ? s.substr(0, 50) + "..." : s;
                },
                recordTransformOpts: {
                    mapDateFields: true,
                    mapNodeToLabel: true,
                    mapEnumToDisplay: true,
                    flattenObjectFields: true
                }
            }
            let schema = TwingateApiClient.Schema[config.typeName];
            let records = await client[config.fetchFn](configForCli);
            if (schema.labelField != null) records = sortByTextField(records, schema.labelField);

            switch (options.outputFormat) {
                case "table":
                    let ws = XLSX.utils.json_to_sheet(records);
                    let [header, ...recordsArr] = XLSX.utils.sheet_to_json(ws, {raw: false, header: 1});
                    let table = new Table()
                        .header(header)
                        .body(recordsArr)
                        .border(true)
                        .render()
                    ;
                    break;
                case "json":
                    console.dir(JSON.stringify(records));
                    break;
                default:
                    Log.error(`Unhandled output format: ${options.outputFormat}`);
                    break;
            }
        });
}



