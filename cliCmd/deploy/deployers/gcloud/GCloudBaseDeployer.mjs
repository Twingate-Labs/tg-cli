import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class GCloudBaseDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "gcloud";
    }

    getGCloudCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        cliOptions.push("--format", "json");
        if (cliOptions.project != null) {
            cmd.push("--project", cliOptions.project);
        }
        return cmd;
    }

    getGCloudComputeCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, "compute", command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        cliOptions.push("--format", "json");
        if (cliOptions.project != null) {
            cmd.push("--project", cliOptions.project);
        }
        return cmd;
    }

    async getCurrentProject() {
        const cmd = this.getGCloudCommand("config", "list");
        const output = await execCmd(cmd);
        const account = JSON.parse(output).core;
        if ( typeof account !== "object" ) {
            Log.error("Unable to fetch project, check that you are logged in to GCloud.");
            throw new Error("Not able to get project");
        }
        return account;
    }

    async getResourceGroups() {
        const cmd = this.getGCloudComputeCommand("networks", "list");
        const output = await execCmd(cmd);
        let resourceGroups = JSON.parse(output);
        resourceGroups = sortByTextField(resourceGroups, "name");
        return resourceGroups;
    }

    async getVirtualNetworks(resourceGroupName=null) {
        const cmd = this.getAzureCommand("network", "vnet");
        cmd.push("list");
        if ( resourceGroupName != null ) cmd.push("-g", resourceGroupName);
        const output = await execCmd(cmd);
        let vnets = JSON.parse(output);
        return vnets;
    }

    async selectResourceGroup() {
        const resourceGroups = await this.getResourceGroups();
        const fields = [
            {name: "location"},
            {name: "name"}
        ]
        const options = tablifyOptions(resourceGroups, fields, (v) => v.id);
        const resourceGroupId = await Select.prompt({
            message: "Select Resource Group",
            options
        });
        return resourceGroups.find(resourceGroup => resourceGroup.id === resourceGroupId);
    }

    async selectVirtualNetwork(resourceGroupName) {
        const vnets = await this.getVirtualNetworks(resourceGroupName);
        if ( vnets.length === 0 ) {
            Log.error("No vnets found");
            throw new Error("Cannot continue - no virtual networks");
        }
        else if ( vnets.length === 1 ) {
            Log.info(`Using vnet '${Colors.italic(vnets[0].name)}'`);
            return vnets[0];
        }
        const fields = [
            {name: "name"}
        ]
        const options = tablifyOptions(vnets, fields, (v) => v.id);
        const vnetId = await Select.prompt({
            message: "Select Virtual Network",
            options
        });
        return vnets.find(vnet => vnet.id === vnetId);
    }

    async selectSubnet(subnets) {
        const fields = [
            {name: "addressPrefix"},
            {name: "name"},
            {name: "natGateway", formatter: (value) => value !== null ? Colors.italic("(NAT)"):""}
        ]
        const options = tablifyOptions(subnets, fields, (v) => v.id);
        const defaultSubnet = subnets.find(subnet => subnet.natGateway != null);
        const subnetId = await Select.prompt({
            message: "Select Subnet",
            options,
            hint: subnets.some(s => s.natGateway == null) ? "If you select a subnet without a NAT then an IP will be assigned to your connector" : undefined,
            default: defaultSubnet ? defaultSubnet.id : undefined
        });
        return subnets.find(subnet => subnet.id === subnetId);
    }

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        await this.getCurrentSubscription();
    }
}