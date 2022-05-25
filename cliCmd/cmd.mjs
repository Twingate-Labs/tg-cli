import {Command} from "https://deno.land/x/cliffy/command/mod.ts";

export * from "./exportCmd.mjs";
export * from "./importCmd.mjs";
export * from "./removeAllCmd.mjs";
import {getCopyCommand} from "./copyCmd.mjs";
import {getCreateCommand} from "./createCmd.mjs";
import {getListCommand} from "./listCmd.mjs";
import {getRemoveCommands} from "./removeCmd.mjs";
import {getAddUserToGroupCommands} from "./cmdAddUserToGroup.mjs";
import {getAddResourceToSericeAccountCommands} from "./cmdAddResourceToServiceAccount.mjs";
import {getRemoveBulkCommands} from "./removeBulkCmd.mjs";

export function getTopLevelCommand(name) {

    let cmd = new Command()
        .arguments('')
        .description(`Twingate ${name}s`)
        .command("list", getListCommand(name))
    ;

    let createCmd = getCreateCommand(name);
    if ( createCmd !== null ) cmd = cmd.command("create", createCmd);

    let removeCmd = getRemoveCommands(name)
    if ( removeCmd !== null ) cmd = cmd.command("remove", removeCmd);

    let addUserToGroupCmd = getAddUserToGroupCommands(name)
    if ( addUserToGroupCmd !== null ) cmd = cmd.command("add_user_to_group", addUserToGroupCmd)

    let removeBulkCmd = getRemoveBulkCommands(name)
    if ( removeBulkCmd !== null ) cmd = cmd.command("remove_bulk", removeBulkCmd)

    let addResourceToServiceAccount = getAddResourceToSericeAccountCommands(name)
    if ( addResourceToServiceAccount !== null ) cmd = cmd.command("add_resource_to_service_account", addResourceToServiceAccount)


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
