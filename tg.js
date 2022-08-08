#!/usr/bin/env -S deno run --allow-all --unstable

import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {TwingateApiClient} from "./TwingateApiClient.mjs";
import {Log, LOG_LEVELS} from "./utils/log.js";
import {
    exportCmd,
    removeAllCmd,
    importCmd,
    removeDuplicateResourceCmd,
    scriptCmd,
    getTopLevelCommand,
} from "./cliCmd/cmd.mjs";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {deployCmd} from "./cliCmd/deploy/index.mjs";
import {VERSION} from "./version.js";

async function main(args) {

    const topLevelCommands = ["resource", "group", "user", "network", "connector", "device", "service"];
    const LogLevelType = new EnumType(Object.keys(LOG_LEVELS));
    let cmd = new Command()
        .name("tg")
        .version(`CLI Version: ${VERSION} | TwingateApiClient Version: ${TwingateApiClient.VERSION}`)
        .description("CLI for Twingate")
        .type("LogLevel", LogLevelType)
        .option("-a, --account-name <string>", "Twingate account name", {
            global: true,
            default: Deno.env.get("TG_ACCOUNT")
        })
        .option("-l, --log-level [logLevel:LogLevel]", "Log level", {
            global: true,
            //hidden: true,
            default: Deno.env.get("LOG_LEVEL") || "INFO",
            action: (options) => Deno.env.set("LOG_LEVEL", options.logLevel)
        })
        .action(async (options) => {
            Log.success(`This is the Twingate CLI tool, ${Colors.italic('tg')}`);
            `
  __          
_/  |_  ____  
\\   __\\/ ___\\ 
 |  | / /_/  >
 |__| \\___  / 
     /_____/  
`.split("\n").map(Log.info);
            Log.info(`No parameters specified, please try:`);
            Log.info(Colors.italic(`tg --help`));
            Log.info(`For a list of possible commands.`);
            Log.info("");
            Log.info(`For assistance with this tool please visit https://github.com/twingate-labs/tg-cli`);
            return 0;
        })
        .command("export", exportCmd)
        .command("import", importCmd)
        .command("remove-duplicate-resource", removeDuplicateResourceCmd)
        .command("remove-all", removeAllCmd)
        .command("script", scriptCmd)
        .command("deploy", deployCmd)
    ;
    for ( const command of topLevelCommands ) cmd = cmd.command(command, getTopLevelCommand(command));
    return await cmd.parse(args);
}

try {
    await main(Deno.args);
} catch (e) {
    Log.exception(e);
}