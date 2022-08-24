// See https://github.com/axetroy/deno_machine_id

//const buff_to_base64 = (buff) => btoa(String.fromCharCode.apply(null, buff));
//const base64_to_buf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(null));

import {execCmd} from "./utils/smallUtilFuncs.mjs";
import {Log} from "./utils/log.js";

const enc = new TextEncoder();
const dec = new TextDecoder();


async function machineId() {
    let guid = "";
    try {
        switch (Deno.build.os) {
            case "linux": {
                var output = "";
                try {
                    output = await execCmd(
                        ["cat", "/var/lib/dbus/machine-id", "/etc/machine-id"],
                    );
                } catch {
                    output = await execCmd(["hostname"]);
                }
                guid = output
                    .substr(0, output.indexOf("\n"))
                    .replace(/\r+|\n+|\s+/ig, "")
                    .toLowerCase();
                break;
            }

            case "darwin": {
                const output = await execCmd(
                    ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                );
                guid = output.split("IOPlatformUUID")[1]
                    .split("\n")[0].replace(/\=|\s+|\"/ig, "")
                    .toLowerCase();
                break;
            }

            case "windows": {
                const output = await execCmd(
                    [
                        "REG",
                        "QUERY",
                        "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography",
                        "/v",
                        "MachineGuid",
                    ],
                );
                guid = output
                    .split("REG_SZ")[1]
                    .replace(/\r+|\n+|\s+/ig, "")
                    .toLowerCase();
                break;
            }
        }
    }
    catch (e) {
        Log.warn(`Unable to retrieve machineId.`)
    }
    return guid;
}

const HW_ID = await machineId();

const getPasswordKey = (password) =>
    crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey", "deriveBits"]);

const deriveKey = (passwordKey, salt, keyUsage) =>
    crypto.subtle.deriveKey(
        {name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256"},
        passwordKey, {name: "AES-CBC", length: 256}, false, keyUsage
    );

const IV_SIZE = 16;
const SALT_SIZE = 16;

export async function encryptData(secretData, password = HW_ID) {

    const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
    const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
    const encryptedContent = await crypto.subtle.encrypt({name: "AES-CBC", iv}, aesKey, enc.encode(secretData));

    const encryptedContentArr = new Uint8Array(encryptedContent);
    let buff = new Uint8Array(
        salt.byteLength + iv.byteLength + encryptedContentArr.byteLength
    );
    buff.set(salt, 0);
    buff.set(iv, salt.byteLength);
    buff.set(encryptedContentArr, salt.byteLength + iv.byteLength);
    return buff;

}

export async function decryptData(encryptedDataBuff, password = HW_ID) {
    const salt = encryptedDataBuff.slice(0, SALT_SIZE);
    const iv = encryptedDataBuff.slice(SALT_SIZE, SALT_SIZE + IV_SIZE);
    const data = encryptedDataBuff.slice(SALT_SIZE + IV_SIZE);
    const passwordKey = await getPasswordKey(password);
    const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);
    const decryptedContent = await crypto.subtle.decrypt({name: "AES-CBC", iv}, aesKey, data);
    return dec.decode(decryptedContent);
}