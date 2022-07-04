/**
 * A place for small util funcs. Some may get moved to a different location later
 */
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {
    Input as InputPrompt, prompt,
    Secret as SecretPrompt,
    Toggle as TogglePrompt
} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {exists as fileExists} from "https://deno.land/std/fs/mod.ts";
import {decryptData, encryptData} from "../crypto.mjs";
import {Log} from "./log.js";
import {Input} from "https://deno.land/x/cliffy@v0.20.1/prompt/input.ts";

export function genFileNameFromNetworkName(networkName, extension = "xlsx") {
    const
        d = new Date(),
        date = d.toISOString().split('T')[0],
        time = (d.toTimeString().split(' ')[0]).replaceAll(":", "-");
    return `${networkName}-${date}_${time}.${extension}`;
}


export async function loadNetworkAndApiKey(networkName = null) {
    let apiKey = Deno.env.get("TG_API_KEY"),
        saveConfig = false,
        keyConf = {},
        availableNetworks = [];
    const
        confirmMultipleNetworks = networkName == null,
        keyFile = ".tgkeys",
        keyFilePath = `./${keyFile}`,
        networkNamePrompt = {
            name: "networkName", message: `Enter Twingate account:`,
            hint: `For example, '${Colors.red("acme")}' for '${Colors.red("acme")}.twingate.com'`, type: InputPrompt,
            suggestions: availableNetworks,
            validate: async (networkName) => ((await TwingateApiClient.testNetworkValid(networkName)) ? true : `Network not found: '${networkName}'.`)
        },
        apiKeyPrompt = {name: "apiKey", message: `Enter API key:`, type: SecretPrompt},
        saveConfigConfirmation = {
            name: "saveConfig", message: `Save account and API key to file?`,
            hint: `Will be saved to '${Colors.yellow(keyFile)}'.`, type: TogglePrompt
        },
        chooseAccountPrompt = {
            message: "Choose Twingate account",
            hint: "There are multiple accounts in the config file, please select one. Use Arrow keys (↑, ↓) to navigate, Tab (⇥) to select an option and Return (↵) to confirm.",
            list: true
        }
    ;

    if ( apiKey != null && networkName != null ) {
        return {networkName, apiKey};
    }

    try {
        if (false === await fileExists(keyFilePath)) throw new Error("Keyfile does not exist");
        let confFileData = await decryptData(await Deno.readFile(keyFilePath));
        keyConf = JSON.parse(confFileData);
        // TODO fix case of no network name + multiple apiKeys
        if ( typeof keyConf.apiKeys === "object" ) availableNetworks.push(...Object.keys(keyConf.apiKeys));
        if ( confirmMultipleNetworks && availableNetworks.length > 1 ) {
            networkName = await Input.prompt({/*default: keyConf.networkName, */suggestions: availableNetworks, ...chooseAccountPrompt});
        }
        else {
            networkName = networkName || keyConf["networkName"];
        }
        if (networkName == null) throw new Error("Network missing");
        let apiKey = keyConf.apiKeys[networkName];
        if (apiKey == null) throw new Error("API key missing in config.");
        Log.info(`Using Twingate account: '${Colors.italic(networkName)}'`);
        return {networkName, apiKey};
    } catch (e) {
        if ( networkName != null ) networkNamePrompt.default = networkName;
        ({networkName} = await prompt([networkNamePrompt]));
        ({apiKey} = await prompt([{
            ...apiKeyPrompt,
            validate: async (apiKey) => ((await TwingateApiClient.testApiKeyValid(networkName, apiKey)) ? true : `API key not valid.`)
        }]));
        ({saveConfig} = await prompt([saveConfigConfirmation]));

        if (saveConfig === true) {
            let existingApiKeys = keyConf.apiKeys;
            keyConf = {
                networkName,
                apiKeys: {
                    [networkName]: apiKey,
                    ...existingApiKeys
                },
                _version: TwingateApiClient.VERSION
            }
            await Deno.writeFile(keyFilePath, await encryptData(JSON.stringify(keyConf)), {mode: 0o600});
            Log.info("Configuration file saved.");
        }
        return {networkName, apiKey};
    }
}

export function sortByTextField(arr, prop, defaultVal = "") {
    return arr.sort((a,b) => (a[prop]||defaultVal).localeCompare(b[prop]||defaultVal));
}
export function setLastConnectedOnUser(nodeObj) {
    if ( !nodeObj.Device || !nodeObj.User ) return;
    const MIN_DATE = new Date(-8640000000000000);
    const lastConnectedMap = new Map();
    nodeObj.Device
        .filter(d => d.lastConnectedAt != null)
        .forEach(d => d.lastConnectedAt = new Date(d.lastConnectedAt))
    ;
    let devices = nodeObj.Device.sort((a, b) => {
        a = a.lastConnectedAt || MIN_DATE;
        b = b.lastConnectedAt || MIN_DATE;
        return b.getTime() - a.getTime();
    });
    devices.forEach((d) => {
        if (!lastConnectedMap.has(d.userLabel)) lastConnectedMap.set(d.userLabel, d.lastConnectedAt)
    });

    for (const user of nodeObj.User) user.lastConnectedAt = lastConnectedMap.get(user.email);
}


const portTestRegEx = /^[0-9]+$/.compile();
export const AFFIRMATIVES = ["YES", "Y", "TRUE", "T"]
export function tryProcessPortRestrictionString(restrictions) {
    // 443, 8080-8090
    const validatePortNumber = (port) => {
        if ( !portTestRegEx.test(port) ) throw new Error(`Invalid port: ${port}`);
        let portNum = Number(port);
        if ( portNum < 1 || portNum > 65535 ) throw new Error(`Invalid port range: ${portNum}`);
        return portNum;
    }
    const singleRestrictionToObj = (restriction) => {
        restriction = restriction.trim();
        let ports = restriction.split('-');
        if ( ports.length > 2 ) throw new Error(`Invalid port restriction: ${restriction}`);
        let start = validatePortNumber(ports[0]);
        let end = ports.length === 2 ? validatePortNumber(ports[1]) : start;
        if ( start > end ) throw new Error(`Invalid port restriction - end greater than start: ${restriction}`);
        return {start,end};
    };
    if ( typeof restrictions !== "string" || restrictions.trim() === "") {
        return [];
    }
    return restrictions.split(",").map(singleRestrictionToObj);
}

