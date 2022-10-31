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

export function deviceTrustCommands(name) {
    let cmd = null;
    switch (name) {
        case "device":
            cmd = new Command()
                .arguments("<deviceIdOrSerial:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Trust a device`)
                .action(async (options, deviceIdOrSerial) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let deviceId = deviceIdOrSerial
                    if (!deviceId.startsWith(TwingateApiClient.IdPrefixes.Device)) {
                        deviceId = await client.lookupDeviceBySerial(deviceId);
                        if (deviceId == null) {
                            throw new Error(`Could not find device serial: '${deviceIdOrSerial}'`)
                        }
                    }

                    let res = await client.setDeviceTrust(deviceId, true);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Device '${deviceId}' with serial '${res.serialNumber}' is trusted.`
                            Log.success(msg);
                            break;
                    }
                });
            break;
    }
    return cmd;
}

export function deviceUntrustCommands(name) {
    let cmd = null;
    switch (name) {
        case "device":
            cmd = new Command()
                .arguments("<deviceIdOrSerial:string>")
                .option("-o, --output-format <format:format>", "Output format", {default: "text"})
                .description(`Untrust a device`)
                .action(async (options, deviceIdOrSerial) => {
                    const {networkName, apiKey, client} = await loadClientForCLI(options);
                    options.apiKey = apiKey;
                    options.accountName = networkName;

                    let deviceId = deviceIdOrSerial
                    if (!deviceId.startsWith(TwingateApiClient.IdPrefixes.Device)) {
                        deviceId = await client.lookupDeviceBySerial(deviceId);
                        if (deviceId == null) {
                            throw new Error(`Could not find device serial: '${deviceIdOrSerial}'`)
                        }
                    }

                    let res = await client.setDeviceTrust(deviceId, false);

                    switch (options.outputFormat) {
                        case OutputFormat.JSON:
                            //console.dir(res, {'maxArrayLength': null});
                            console.log(JSON.stringify(res));
                            break;
                        default:
                            let msg = `Device '${deviceId}' with serial '${res.serialNumber}' is untrusted.`
                            Log.success(msg);
                            break;
                    }
                });
            break;
    }
    return cmd;
}

