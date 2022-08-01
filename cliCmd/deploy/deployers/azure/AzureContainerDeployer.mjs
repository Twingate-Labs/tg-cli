import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {AzureBaseDeployer} from "./AzureBaseDeployer.mjs";

export class AzureContainerDeployer extends AzureBaseDeployer {


    async createContainer(resourceGroupName, vnetName, subnetName, name) {
        /*const cmd = this.getMultipassCommand("launch", null);
        cmd.push("-n", name);
        cmd.push("--cloud-init", cloudInitFile);
        cmd.push("22.04");
        const [code, output, error] = await execCmd2(cmd);
        return [code, output, error];*/
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
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            tokens = await this.client.generateConnectorTokens(connector.id)
        ;

        Log.info("Creating Azure Container, please wait.");

        try {
            //const [code, output, error] = await this.createVm(hostname, cloudConfigFile);
            if ( code !== 0 ) throw new Error(error);
            Log.success(`Created connector using Azure Container Service!\n`);
            return 0;
        }
        catch (e) {
            Log.error(e);
            throw e;
        }
    }
}