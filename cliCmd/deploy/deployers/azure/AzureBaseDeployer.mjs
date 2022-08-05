import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class AzureBaseDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "az";
    }

    getAzureCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        if (cliOptions.subscription != null) {
            cmd.push("--subscription", cliOptions.subscription);
        }
        return cmd;
    }

    async getCurrentSubscription() {
        const cmd = this.getAzureCommand("account", "show");
        const output = await execCmd(cmd);
        const subscription = JSON.parse(output);
        if ( typeof subscription !== "object" ) {
            Log.error("Unable to fetch subscription, check that you are logged in to Azure.");
            throw new Error("Not able to get subscription");
        }
        return subscription;
    }

    async getResourceGroups() {
        const cmd = this.getAzureCommand("group", "list");
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
            {name: "location"},
            {name: "name"},
            {name: "subnets", formatter: (v) => {
                    if ( v.length === 0 ) return "No subnets";
                    else if ( v.length === 1 ) return "1 subnet";
                    else return `${v.length} subnets`;
                }}
        ]
        const options = tablifyOptions(vnets, fields, (v) => v.id, (v) => v.subnets.length === 0);
        const vnetId = await Select.prompt({
            message: "Select Virtual Network",
            options
        });
        return vnets.find(vnet => vnet.id === vnetId);
    }

    async selectSubnet(subnets) {
        if ( subnets.length === 1 ) {
            Log.info(`Using subnet '${Colors.italic(subnets[0].name)}'`);
            return subnets[0];
        }
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