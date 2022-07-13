import {Command} from "https://deno.land/x/cliffy/command/mod.ts";

export * from "./exportCmd.mjs";
export * from "./importCmd.mjs";
export * from "./removeAllCmd.mjs";
export * from "./removeDuplicateResource.mjs"
export * from "./scriptCmd.mjs";
import {getCopyCommand} from "./copyCmd.mjs";
import {getCreateCommand} from "./createCmd.mjs";
import {getListCommand} from "./listCmd.mjs";
import {getRemoveCommands} from "./removeCmd.mjs";
import {getAddUserToGroupCommands, getRemoveUserFromGroupCommands} from "./cmdUserGroup.mjs";
import {getAddResourceToSericeAccountCommands} from "./cmdAddResourceToServiceAccount.mjs";
import {getRemoveBulkCommands} from "./removeBulkCmd.mjs";
import {
    getAddGroupToResourceCommands,
    getAddResourceToGroupCommands,
    getRemoveGroupFromResourceCommands, getRemoveResourceFromGroupCommands
} from "./cmdGroupResource.mjs"
import {getServiceAccountKeyCreateCommands} from "./serviceAccountKey.mjs";
import {getGroupFromResourceCommands, getResourceFromGroupCommands, getAllUserEmailCommands} from "./getCmd.mjs";

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

    let removeBulkCmd = getRemoveBulkCommands(name)
    if ( removeBulkCmd !== null ) cmd = cmd.command("remove_bulk", removeBulkCmd)

    let addUserToGroupCmd = getAddUserToGroupCommands(name)
    if ( addUserToGroupCmd !== null ) cmd = cmd.command("add_user", addUserToGroupCmd)

    let removeUserFromGroupCmd = getRemoveUserFromGroupCommands(name)
    if ( removeUserFromGroupCmd !== null ) cmd = cmd.command("remove_user", removeUserFromGroupCmd)

    let addGroupToResource = getAddGroupToResourceCommands(name)
    if ( addGroupToResource !== null ) cmd = cmd.command("add_group", addGroupToResource)

    let removeGroupFromResource = getRemoveGroupFromResourceCommands(name)
    if ( removeGroupFromResource !== null ) cmd = cmd.command("remove_group", removeGroupFromResource)

    let removeResourceFromGroup = getRemoveResourceFromGroupCommands(name)
    if ( removeResourceFromGroup !== null ) cmd = cmd.command("remove_resource", removeResourceFromGroup)

    let addResourceToServiceAccount = getAddResourceToSericeAccountCommands(name)
    if ( addResourceToServiceAccount !== null ) cmd = cmd.command("add_resource", addResourceToServiceAccount)

    let getGroupFromResource = getGroupFromResourceCommands(name)
    if ( getGroupFromResource !== null ) cmd = cmd.command("get_group", getGroupFromResource)

    let getResourceFromGroup = getResourceFromGroupCommands(name)
    if ( getResourceFromGroup !== null ) cmd = cmd.command("get_resource", getResourceFromGroup)

    let getUserFromGroup = getAllUserEmailCommands(name)
    if ( getUserFromGroup !== null ) cmd = cmd.command("get_email", getUserFromGroup)


    let addResourceToGroup = getAddResourceToGroupCommands(name)
    if ( addResourceToGroup !== null ) cmd = cmd.command("add_resource", addResourceToGroup)

    let serviceAccountKeyCreate = getServiceAccountKeyCreateCommands(name)
    if ( serviceAccountKeyCreate !== null ) cmd = cmd.command("key_create", serviceAccountKeyCreate)


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
