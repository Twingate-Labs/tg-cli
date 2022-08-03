import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, formatBinary, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
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
            Log.error(`'${this.cliCommand} account get' returned non-zero exit code: ${output} - please check '${this.cliCommand}' is configured correctly.`);
        }
        const doAccount = JSON.parse(output);
        Log.info(`Using DigitalOcean account: ${Colors.italic(doAccount.email)}`);
        if ( !doAccount.email_verified) Log.error(`DigitalOcean account email not verified.`);
        if ( "active" !== doAccount.status) Log.error(`DigitalOcean account not active.`);
        return doAccount;
    }

    getDoCommand(command, subCommand, options = {}) {
        let cmd = [this.cliCommand, command];

        if (typeof subCommand === "string") cmd.push(subCommand);
        else if ( Array.isArray(subCommand) ) cmd.push(...subCommand);

        if ( options.name ) {
            if (typeof options.name === "string") cmd.push(options.name);
            else if ( Array.isArray(options.name) ) cmd.push(...options.name);
        }

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

    getDoComputeCommand(command, subCommand, options = {}) {
        if (!Array.isArray(subCommand) ) subCommand = [command, subCommand];
        else subCommand = ["compute", command, ...subCommand];
        return this.getDoCommand("compute", subCommand, options);
    }

    async getProjects() {
        const cmd = this.getDoCommand("projects", "list");
        return JSON.parse(await execCmd(cmd));
    }

    async getRegions() {
        const cmd = this.getDoComputeCommand("region", "list")
        return JSON.parse(await execCmd(cmd)).filter(r => r.available);
    }


    async getInstanceSizes() {
        const cmd = this.getDoComputeCommand("size", "list")
        return JSON.parse(await execCmd(cmd)).filter(r => r.available);
    }

    async selectProject() {
        const projects = await this.getProjects();
        if ( projects.length === 1 ) return projects[0];
        const fields = [
            {name: "name"},
            {name: "description"}
        ]
        const defaultProject = projects.find(p => p.is_default);
        const options = tablifyOptions(projects, fields, (v) => v.id);
        const projectId = await Select.prompt({
            message: "Select Project",
            options,
            default: defaultProject !== undefined ? defaultProject.id : undefined
        });
        return projects.find(project => projects.id === projectId);
    }

    async selectRegion() {
        const regions = await this.getRegions();
        const fields = [
            {name: "slug"},
            {name: "name"}
        ]
        const options = tablifyOptions(regions, fields, (v) => v.slug);
        const regionSlug = await Select.prompt({
            message: "Select region",
            options,
            hint: "Only available regions are shown."
        });
        return regions.find(region => region.slug === regionSlug);
    }


    async selectSize(region) {
        const sizes = (await this.getInstanceSizes()).filter(s => region.sizes.includes(s.slug));
        const priceFormatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        });

        const fields = [
            {name: "description"},
            {name: "price_monthly", formatter: priceFormatter.format},
            {name: "vcpus", formatter: (v) => `${v} CPU`},
            {name: "memory", formatter: (v) => (formatBinary(v, "MB"))},
            {name: "transfer", formatter: (v) => (formatBinary(v, "TB"))}
        ]
        const options = tablifyOptions(sizes, fields, (v) => v.slug);
        const instanceSize = await Select.prompt({
            message: "Select instance size",
            options,
            default: "s-1vcpu-2gb",
            hint: "Only available sizes are shown."
        });
        return instanceSize;
    }
    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        const
            //machineType = this.cliOptions.machineType || "n1-standard-1",
            //project = await this.getCurrentProject(),
            //remoteNetwork = await this.selectRemoteNetwork(),
            //connector = await this.selectConnector(remoteNetwork),
            region = await this.selectRegion(),
            size = await this.selectSize(region)
        ;
    }
}