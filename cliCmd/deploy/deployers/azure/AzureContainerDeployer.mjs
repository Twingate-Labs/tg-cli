import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {AzureBaseDeployer} from "./AzureBaseDeployer.mjs";

export class AzureContainerDeployer extends AzureBaseDeployer {


    async createContainer(resourceGroupName, vnetName, subnetName, name, options,accountUrl, tokens) {
        const cmd = this.getAzureCommand("container", "create");
        cmd.push("--name", name);
        cmd.push("--image", "twingate\/connector:1");
        cmd.push("--resource-group", resourceGroupName);
        cmd.push("--vnet", vnetName);
        cmd.push("--subnet", subnetName)
        cmd.push("--cpu", options.cpu)
        cmd.push("--memory", options.memory)

        // let envString =`TENANT_URL=${accountUrl} ACCESS_TOKEN=${tokens.accessToken} REFRESH_TOKEN=${tokens.refreshToken} TWINGATE_TIMESTAMP_FORMAT=2 TWINGATE_LABEL_DEPLOYEDBY=tgcli-az-acs`;
        // cmd.push("--environment-variables", envString);
        cmd.push("--environment-variables")
        cmd.push(`TENANT_URL=${accountUrl}`)
        cmd.push(`ACCESS_TOKEN=${tokens.accessToken}`)
        cmd.push(`REFRESH_TOKEN=${tokens.refreshToken}`)
        cmd.push(`TWINGATE_TIMESTAMP_FORMAT=2`)
        cmd.push(`TWINGATE_LABEL_DEPLOYEDBY=tgcli-az-acs`)


        const output = await execCmd(cmd);
        let vnets = JSON.parse(output);
        return vnets;

    }

    async deploy() {
        await super.deploy();
        const
            options = this.cliOptions,
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            resourceGroup = await this.selectResourceGroup(),
            location = resourceGroup.location,
            vnet = await this.selectVirtualNetwork(resourceGroup.name),
            subnet = await this.selectSubnet(vnet.subnets),
            hostname = `tg-${connector.name}`,
            accountUrl = !this.cliOptions.accountName.includes("stg.opstg.com") ? `https://${this.cliOptions.accountName}.twingate.com`: `https://${this.cliOptions.accountName}`,
            tokens = await this.client.generateConnectorTokens(connector.id);

        Log.info("Creating Azure Container, please wait.");

        const instance = await this.createContainer(resourceGroup.name, vnet.name, subnet.name, hostname, options,accountUrl, tokens);

        Log.success(`Created Azure container instance!\n`);
        const table = new Table();
        table.push(["Location", instance.location]);
        table.push([`${instance.ipAddress.type} IP`, instance.ipAddress.ip]);
        table.render();
    }
}