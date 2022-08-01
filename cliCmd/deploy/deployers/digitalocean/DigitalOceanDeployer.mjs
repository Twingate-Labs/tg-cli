import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class DigitalOceanDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "doctl";
    }

    async checkAvailable() {
        await super.checkAvailable();
        const cmd = this.getDoCommand("account", "get");
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        if ( typeof output === "number" ) {
            Log.error(`'doctl account get' returned non-zero exit code: ${output} - please check doctl is configured correctly.`);
        }
        const doAccount = JSON.parse(output);
        Log.info(`Using Digital Ocean account: ${doAccount.email}`);
        if ( !doAccount.email_verified) Log.error(`DigitalOcean account email not verified.`);
        if ( "active" !== doAccount.status) Log.error(`DigitalOcean account not active.`);
        return doAccount;
    }

    getDoCommand(command, subCommand, options = {}) {
        let cmd = [this.cliCommand, command, subCommand];
        options = Object.assign({
            output: "json",
            context: null
        }, this.cliOptions, options);
        if (options.context != null) {
            cmd.push("--context", options.context);
        }
        if (options.output != null) {
            cmd.push("--output", options.output);
        }
        return cmd;
    }

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
    }
}