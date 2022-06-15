#!/usr/bin/env -S deno run --allow-all --unstable

import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {TwingateApiClient} from "./TwingateApiClient.mjs";
import {Log, LOG_LEVELS} from "./utils/log.js";
import {
    exportCmd,
    removeAllCmd,
    importCmd,
    removeDuplicateResourceCmd,
    getTopLevelCommand,
    getTopLevelCommand,
    scriptCmd
} from "./cliCmd/cmd.mjs";

async function main(args) {

    const topLevelCommands = ["resource", "group", "user", "network", "connector", "device", "service_account"];
    const LogLevelType = new EnumType(Object.keys(LOG_LEVELS));
    let cmd = new Command()
        .name("tg")
        .version(TwingateApiClient.VERSION)
        .description("CLI for Twingate")
        .type("LogLevel", LogLevelType)
        .option("-a, --account-name <string>", "Twingate account name", {global: true})
        .option("-l, --log-level [logLevel:LogLevel]", "Log level", {
            global: true,
            //hidden: true,
            default: Deno.env.get("LOG_LEVEL") || "INFO",
            action: (options) => Deno.env.set("LOG_LEVEL", options.logLevel)
        })
        .command("export", exportCmd)
        .command("import", importCmd)
        .command("remove-duplicate-resource", removeDuplicateResourceCmd)
        .command("remove-all", removeAllCmd)
        .command("script", scriptCmd)

    ;
    for ( const command of topLevelCommands ) cmd = cmd.command(command, getTopLevelCommand(command));
    return await cmd.parse(args);
}

try {
    await main(Deno.args);
} catch (e) {
    Log.exception(e);
}