import {Command} from "https://deno.land/x/cliffy/command/mod.ts";

export * from "./exportCmd.mjs";
export * from "./importCmd.mjs";
export * from "./removeAllCmd.mjs";
import {getCopyCommand} from "./copyCmd.mjs";
import {getCreateCommand} from "./createCmd.mjs";
import {getListCommand} from "./listCmd.mjs";


export function getTopLevelCommand(name) {

    let cmd = new Command()
        .arguments('')
        .description(`Twingate ${name}s`)
        .command("list", getListCommand(name))
    ;

    let createCmd = getCreateCommand(name);
    if ( createCmd !== null ) cmd = cmd.command("create", createCmd);

    switch (name) {
        case "group":
            cmd = cmd.command("copy", getCopyCommand(name))
            break;
        case "connector":

            break;
        default:
            // NoOp
            break;
    }
    return cmd;
}
