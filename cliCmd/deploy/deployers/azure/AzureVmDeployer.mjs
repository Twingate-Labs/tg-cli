import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {AzureBaseDeployer} from "./AzureBaseDeployer.mjs";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";

export class AzureVmDeployer extends AzureBaseDeployer {

    async getKeyPairs(resourceGroupName) {
        const cmd = this.getAzureCommand("sshkey", "list");
        cmd.push("-g", resourceGroupName);
        const output = await execCmd(cmd);
        return JSON.parse(output);
    }

    async createSshKey(keyName, resourceGroupName) {
        const cmd = this.getAzureCommand("sshkey", "create");
        cmd.push("-n", keyName);
        cmd.push("-g", resourceGroupName);
            cmd.push("--tags", "Service=twingate-connector");
        const [code, output, errors] = await execCmd2(cmd, {stdErrToArray: true});
        if ( code !== 0 ) {
            errors.forEach(Log.error);
            Log.error(`Could not create SSH key.`);
        }
        else {
            errors.forEach(Log.info);
        }
        return JSON.parse(output);
    }

    async selectKeyPair(resourceGroupName) {
        const keyPairs = await this.getKeyPairs(resourceGroupName);
              //sshKeygenAvailable = await this.checkSshKeygenAvailable();

        const useKeyPair = await Select.prompt({
            message: "SSH Public Key",
            hint: "We recommend use of an SSH key pair",
            options: [
                {name: `Use new`, value: "NEW"},
                {name: `Use existing${Colors.italic(keyPairs.length === 0 ? " (none available)":"")}`, value: "EXISTING", disabled: keyPairs.length === 0},
                {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
            ],
            default: "NEW"
        });
        if ( useKeyPair === "SKIP" ) return null;
        else if ( useKeyPair === "NEW" ) {
            const keyName = await Input.prompt({message: "Key name", default: "tg-connector"});
            await this.createSshKey(keyName, resourceGroupName);
            return keyName;
        }
        else {
            const keyName = await Select.prompt({
                message: "Choose Key Pair",
                options: keyPairs.map(keyPair => ({
                    name: keyPair.KeyName,
                    value: keyPair.KeyName
                }))
            });
            return keyName;
        }
    }

    async createVm(resourceGroupName, vnetName, subnetName, keyName, name, size, customData, assignPublicIp=false) {
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
            keyName = await this.selectKeyPair(resourceGroup.name),
            assignPublicIp = subnet.natGateway == null,
            size = options.size || "Standard_B1ms",
            hostname = `tg-${connector.name}`,
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            cloudConfig = new ConnectorCloudInit()
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-az-vm",
                    location,
                    resourceGroup: resourceGroup.name,
                    vnet: vnet.name,
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                })
                .configure()
        ;

        Log.info("Creating VM, please wait.")
        
        const instance = await this.createVm(resourceGroup.name, vnet.name, subnet.name, keyName, hostname, size, cloudConfig.getConfig(), assignPublicIp);

        Log.success(`Created Azure VM instance!\n`);
        const table = new Table();
        table.push(["Location", instance.location]);
        table.push(["Mac address", instance.macAddress]);
        table.push(["Private IP", instance.privateIpAddress]);
        if ( instance.publicIpAddress !== "" ) table.push(["Public IP", instance.publicIpAddress]);
        table.render();
    }
}