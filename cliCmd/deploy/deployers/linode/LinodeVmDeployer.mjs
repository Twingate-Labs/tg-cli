import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Secret as SecretPrompt, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, formatBinary, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";

export class LinodeVmDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "linode-cli";
        this.image = "linode/ubuntu22.04"
    }

    getLinodeCommand(command, subCommand, options = {}) {
        let cmd = [this.cliCommand, command];

        if (typeof subCommand === "string") cmd.push(subCommand);
        else if ( Array.isArray(subCommand) ) cmd.push(...subCommand);

        if ( options.name ) {
            if (typeof options.name === "string") cmd.push(options.name);
            else if ( Array.isArray(options.name) ) cmd.push(...options.name);
        }
        cmd.push("--json");
        return cmd;
    }


    async checkAvailable() {
        await super.checkAvailable();
        const cmd = this.getLinodeCommand("account", "view");
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        const linodeAccount = JSON.parse(output);
        // todo: choose linode account?
        Log.info(`Using Linode account: ${Colors.italic(linodeAccount[0].email)}`);
        return linodeAccount;
    }

    async getRegions() {
        const cmd = this.getLinodeCommand("regions", "list");
        return JSON.parse(await execCmd(cmd)).filter(r => r.status === "ok");
    }

    async selectRegion() {
        const regions = await this.getRegions();
        let regionNames = new Intl.DisplayNames(['en'], {type: 'region'});

        for (let i = 0; i < regions.length; i++) {
            let subRegion = regions[i].id.split("-")[1]
            subRegion = subRegion[0].toUpperCase() + subRegion.slice(1)
            if (regions[i].id.split("-")[0] === "us"){
                regions[i]["region"] = `US ${subRegion}`
            } else {
                regions[i]["region"] = `${regionNames.of(regions[i].country.toUpperCase())}`
            }
        }


        const fields = [
            {name: "id"},
            {name: "region"}
        ]
        const options = tablifyOptions(regions, fields, (v) => v.id);
        const regionSlug = await Select.prompt({
            message: "Select region",
            options,
            hint: "Only available regions are shown."
        });
        return regions.find(region => region.id === regionSlug);
    }

    async getVpcs(region = null) {
        const cmd = this.getLinodeCommand("vlans", "list");
        const vpcs = JSON.parse(await execCmd(cmd));
        return region == null ? vpcs : vpcs.filter(v => v.region === region);
    }

    async selectVpc(region) {
        const vpcs = await this.getVpcs(region ? region.slug : null);
        if ( vpcs.length === 1 ) return vpcs[0];
        else if ( vpcs.length === 0 ) return null;

        const fields = [
            {name: "region"},
            {name: "label"},
        ]
        const options = tablifyOptions(vpcs, fields, (v) => v.label);
        const vpcLabel = await Select.prompt({
            message: "Select Vlan",
            options,
            default: vpcs.find(v => v.default === true),
            hint: "There are multiple Vlans in this region."
        });
        return vpcs.find(vpc => vpc.label === vpcLabel);
    }

    async checkRegionVlan(region){
        const cmd = this.getLinodeCommand("regions", "list");
        const vpcs = JSON.parse(await execCmd(cmd));
        return vpcs.filter(region => region.capabilities.includes("Vlans")).map(region => region.id).includes(region)
    }

    async getInstanceSizes() {
        const cmd = this.getLinodeCommand("linodes", "types");
        return JSON.parse(await execCmd(cmd));
    }

    async selectSize() {
        // todo: confirm with emrul the filter is logicial
        const sizes = (await this.getInstanceSizes()).filter(size => size.gpus === 0).filter(size => size.class !== "nanode" && size.class !== "standard" );
        for (let i = 0; i < sizes.length; i++) {
            sizes[i]["price_monthly"] = sizes[i].price.monthly
        }

        const priceFormatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        });

        const fields = [
            {name: "id"},
            {name: "price_monthly", formatter: priceFormatter.format},
            {name: "vcpus", formatter: (v) => `${v} CPU`},
            {name: "memory", formatter: (v) => (formatBinary(v, "MB"))},
            {name: "transfer", formatter: (v) => `${v/1000} TB`},
            {name: "network_out", formatter: (v) => `${v/1000} Gbps`},
        ]
        const options = tablifyOptions(sizes, fields, (v) => v.id);
        const instanceSize = await Select.prompt({
            message: "Select instance size",
            options,
            default: "g6-dedicated-2",
            hint: "Only dedicated options are shown. All Linode VMs having a 40 Gbps Network In Speed."
        });
        return instanceSize;
    }

    async getKeyPairs() {
        const cmd = this.getLinodeCommand("sshkeys", "list");
        const output = await execCmd(cmd);
        return JSON.parse(output) || [];
    }

    async createSshKey(keyName) {
        const keyCreated = await this.generateSshKey(keyName);
        if (!keyCreated) {
            throw new Error("Could not create ssh key");
        }
        const publicKey = (await Deno.readTextFile(`${keyName}.pub`)).replace("\n", "");
        // const cmd = this.getLinodeCommand("sshkeys", "create", {output: null});
        // cmd.push("--label", keyName);
        // cmd.push("--ssh_key", publicKey);
        // let [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        // if ( code !== 0 ) throw new Error(error);
        return {name: keyName, key: publicKey};
    }


    async createFirewall(instanceName) {
        const cmd = this.getLinodeCommand("firewalls", "create");
        cmd.push("--label", instanceName)
        cmd.push("--rules.inbound_policy", "DROP")
        cmd.push("--rules.outbound_policy", "ACCEPT")
        const output = await execCmd(cmd);
        return output

    }

    async attachFirewall(firewallId, instanceId){
        const cmd = this.getLinodeCommand("firewalls", "device-create");
        cmd.push(firewallId)
        cmd.push("--id", instanceId)
        cmd.push("--type", "linode")
        const output = await execCmd(cmd);
        return output
    }

    async selectKeyPair(defaultKeyName) {
        const keyPairs = await this.getKeyPairs(),
            sshKeygenAvailable = await this.checkSshKeygenAvailable();

        const useKeyPair = await Select.prompt({
            message: "SSH Public Key",
            hint: "We recommend use of an SSH key pair",
            options: [
                {name: `Use new${Colors.italic(!sshKeygenAvailable ? " (ssh-keygen not available)" : "")}`, value: "NEW", disabled: !sshKeygenAvailable},
                {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
            ],
            default: "NEW"
        });
        if (useKeyPair === "SKIP") {
            return null;
        } else if (useKeyPair === "NEW") {
            const keyName = await Input.prompt({message: "Key name", default: defaultKeyName});
            return await this.createSshKey(keyName);
        }
    }

    //todo: password confirm and more strength requirement check
    async inputRootPassword(){
        let password = await SecretPrompt.prompt({message: "Set root password"});
        while (password.length < 7 || password.length > 128){
            password = await SecretPrompt.prompt({message: "Root password need to be between 7 and 128 characters, set new root password."});
        }
        return password
    }



    async createStackScript(script) {
        const cmd = this.getLinodeCommand("stackscripts", "create");
        cmd.push("--label", "twingate-stackscript")
        cmd.push("--images", this.image)
        cmd.push("--script", script)
        const output = await execCmd(cmd);
        return JSON.parse(output)[0].id;
    }

    async createVm(hostname, size, region, vpc, root_pass, authorized_key, stackscript) {
        const cmd = this.getLinodeCommand("linodes", "create");
        cmd.push("--label", hostname)
        cmd.push("--type", size)
        cmd.push("--image", this.image)
        cmd.push("--region", region.id)
        cmd.push("--root_pass", root_pass)
        cmd.push("--authorized_keys", authorized_key)
        cmd.push("--stackscript_id", stackscript)
        cmd.push("--private_ip", true)

        const vlanAvailable = await this.checkRegionVlan(region.id)

        //todo: check if vlan available in region
        if (vlanAvailable){
            if (vpc === null){
                cmd.push("--interfaces.purpose", "public" )
                cmd.push("--interfaces.label", "")
                cmd.push("--interfaces.purpose", "vlan" )
                cmd.push("--interfaces.label", "tg-vlan")
            } else {
                cmd.push("--interfaces.purpose", "public" )
                cmd.push("--interfaces.label", "")
                cmd.push("--interfaces.purpose", "vlan" )
                cmd.push("--interfaces.label", vpc.label)
            }
        }

        const output = await execCmd(cmd);
        return output
    }


    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        const
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            region = await this.selectRegion(),
            vpc = await this.selectVpc(region),
            size = await this.selectSize(),
            hostname = `tg-${connector.name}`,
            sshKey = await this.selectKeyPair(hostname),   // todo: clean up this as selectkey is not really used
            root_pass = await this.inputRootPassword(),
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = !this.cliOptions.accountName.includes("stg.opstg.com") ? `https://${this.cliOptions.accountName}.twingate.com`: `https://${this.cliOptions.accountName}`,
            logAnalytics = "v1",
            script = `#!/bin/bash
                EGRESS_IP=$(curl https://checkip.amazonaws.com)
                curl "https://binaries.twingate.com/connector/setup.sh" | sudo bash
                {
                echo TWINGATE_URL="${accountUrl}"
                echo TWINGATE_ACCESS_TOKEN="${tokens.accessToken}"
                echo TWINGATE_REFRESH_TOKEN="${tokens.refreshToken}"
                echo TWINGATE_LOG_ANALYTICS=${logAnalytics}
                echo TWINGATE_LABEL_EGRESSIP=$EGRESS_IP
                echo TWINGATE_LABEL_DEPLOYEDBY=tgcli-linode-vm
                } > /etc/twingate/connector.conf
                systemctl enable twingate-connector
                systemctl restart twingate-connector
            `,
            stackScript = await this.createStackScript(script)

        Log.info("Creating VM, please wait.");

        try {
            const createVmOut = JSON.parse(await this.createVm(hostname, size, region, vpc,root_pass, sshKey.key, stackScript))
            const firewall = JSON.parse(await this.createFirewall(hostname))[0].id
            const attachFirewallOut = JSON.parse(await this.attachFirewall(firewall, createVmOut[0].id))
            Log.info("VM created.");
            const table = new Table();
            table.push(["Id", createVmOut[0].id])
            table.push(["Name", createVmOut[0].label])
            table.push(["Region", createVmOut[0].region])
            table.push(["Private IPv4", createVmOut[0].ipv4[1]])
            table.push(["Public IPv4", createVmOut[0].ipv4[0]])
            table.push(["Public IPv6", createVmOut[0].ipv6])
            Log.info(`Please allow a few minutes for the instance to initialize. You should then be able to add the private IP as a resource in Twingate.`);
            Log.info(`You can do this via the Admin Console UI or via the CLI:`);
            Log.info(Colors.italic(`tg resource create "${remoteNetwork.name}" "Connector host ${createVmOut[0].label}" "${createVmOut[0].ipv4[1]}" Everyone`));
            Log.info(`Once done and authenticated to Twingate you can connect to the instance via SSH using the following command:`);
            Log.info(`${Colors.italic(`ssh -i ${sshKey.name} root@$${createVmOut[0].ipv4[1]}`)}`);

        }
        catch (e) {
            Log.error(e);
            throw e;
        }

    }


}