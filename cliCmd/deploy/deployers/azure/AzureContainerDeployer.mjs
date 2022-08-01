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
        /*
        const cmd = this.getAzureCommand("vm", "create");
        cmd.push("-g", resourceGroupName);
        cmd.push("--vnet-name", vnetName);
        cmd.push("--name", name);
        cmd.push("--accept-term");
        // See https://docs.microsoft.com/en-gb/azure/virtual-machines/automatic-vm-guest-patching#supported-os-images
        // cmd.push("--image", "canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest");
        cmd.push("--image", "canonical:0001-com-ubuntu-server-focal:20_04-lts:latest");
        //cmd.push("--image", "canonical:0001-com-ubuntu-minimal-focal:minimal-20_04-lts:latest");
        cmd.push("--custom-data", customData);
        cmd.push("--enable-hotpatching");
        cmd.push("--patch-mode", "AutomaticByPlatform");
        cmd.push("--size", size);
        if ( keyName === "" ) {
            cmd.push("--generate-ssh-keys");
        }
        else if ( typeof keyName === "string" ) {
            cmd.push("--ssh-key-name", keyName);
        }
        cmd.push("--subnet", subnetName);
        cmd.push("--tags", "Service=twingate-connector");
        if ( assignPublicIp === false ) {
            cmd.push("--public-ip-address", "");
        }
        else {
            cmd.push("--public-ip-sku", "Standard");
        }
        cmd.push("--nic-delete-option", "Delete");
        cmd.push("--os-disk-delete-option", "Delete");
        //cmd.push("--ephemeral-os-disk");
        //cmd.push("--ephemeral-os-disk-placement", "CacheDisk");
        cmd.push("--nsg", "twingate-connectorNSG");
        cmd.push("--nsg-rule", "NONE");
        */
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