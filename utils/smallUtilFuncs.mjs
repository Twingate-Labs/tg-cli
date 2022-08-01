/**
 * A place for small util funcs. Some may get moved to a different location later
 */
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {Input as InputPrompt, prompt, Secret as SecretPrompt, Toggle as TogglePrompt} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {exists as fileExists} from "https://deno.land/std/fs/mod.ts";
import {decryptData, encryptData} from "../crypto.mjs";
import {Log} from "./log.js";
import {Input} from "https://deno.land/x/cliffy@v0.20.1/prompt/input.ts";
import {VERSION} from "../version.js";

export function genFileNameFromNetworkName(networkName, extension = "xlsx") {
    const
        d = new Date(),
        date = d.toISOString().split('T')[0],
        time = (d.toTimeString().split(' ')[0]).replaceAll(":", "-");
    return `${networkName}-${date}_${time}.${extension}`;
}

export async function loadClientForCLI(options) {
    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
    const app = Deno.env.get("TG_APPLICATION") || 'tg-cli';
    const applicationName = `${app}/${VERSION}`
    const client = new TwingateApiClient(networkName, apiKey, {
        logger: Log,
        applicationName
    });
    return {networkName, apiKey, client};
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

export async function loadExternalKey(type, env = null) {
    let key = null,
        keyConf = null;
    if ( env != null && Deno.env.get(env) != null ) {
        key = Deno.env.get(env);
        return [key, false];
    }
    const
        keyFile = ".tgkeys",
        keyFilePath = `./${keyFile}`
    ;

    if (false === await fileExists(keyFilePath)) return [null, false];
    let confFileData = await decryptData(await Deno.readFile(keyFilePath));
    keyConf = JSON.parse(confFileData);
    if ( !Array.isArray(keyConf.extKeys) ) return [null, true];
    return keyConf.extKeys.find(extKey => extKey.type === type);
}

export function sortByTextField(arr, prop, defaultVal = "") {
    return arr.sort((a,b) => (a[prop]||defaultVal).localeCompare(b[prop]||defaultVal));
}

export function tablifyOptions(objArr, fields=[], valueFn=(v)=>v.value, disabledFn=(o)=>o.disabled, seperator=" | ") {
    for (let x = 0; x < fields.length; x++) {
        const field = fields[x];
        field._maxLen = Math.max(...objArr.map(obj => (obj[field.name]||"").length ));
        field.defaultValue = field.defaultValue || "";
        field._nameTemplate = `obj.${field.name}`;
        if ( typeof field.defaultValue === "function" ) {
            field._nameTemplate += ` || fields[${x}].defaultValue(obj, fields[${x}])`;
        }
        else if ( typeof field.formatter !== "function" ) {
            field._nameTemplate += ` || "${field.defaultValue}"`;
        }

        if ( typeof field.formatter === "function" ) {
            field._nameTemplate = `fields[${x}].formatter(${field._nameTemplate}, obj, fields[${x}])||""`;
        }
        field._nameTemplate = `(${field._nameTemplate}).padEnd(${field._maxLen}, " ")`;
    }

    const objToNameFn = new Function("obj", "fields", `return "| " + [${fields.map(f => f._nameTemplate).join(",")}].join("${seperator}")`);
    return objArr.map(obj => ({
        name: objToNameFn(obj, fields),
        value: valueFn(obj),
        disabled: disabledFn(obj)
    }))
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


export async function execCmd(cmd, opts={}) {
    const p = Deno.run(Object.assign({
        cmd,
        stdout: "piped",
        stderr: "piped",
    }, opts));

    const { code } = await p.status();

    if (code === 0) {
        const rawOutput = await p.output();
        return new TextDecoder().decode(rawOutput);
    }
    else if ( opts.returnOnNonZeroError === true ) {
        return code;
    }
    else {
        const rawError = await p.stderrOutput();
        const errorString = new TextDecoder().decode(rawError);
        throw new Error(errorString);
    }
}

export async function execCmd2(cmd, opts={}) {
    const runCommand = Object.assign({
            cmd,
            stdout: "piped",
            stderr: "piped",
        }, opts),
        p = Deno.run(runCommand),
        { code } = await p.status(),
        decoder = new TextDecoder(),
        output = runCommand.stdout === "piped" ? decoder.decode(await p.output()) : null
    ;
    let error = runCommand.stderr === "piped" ? decoder.decode(await p.stderrOutput()) : null;
    if ( opts.stdErrToArray === true && typeof error === "string") error = error.split(/\r?\n/);
    return [code, output, error];
}

const portTestRegEx = /^[0-9]+$/;
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

