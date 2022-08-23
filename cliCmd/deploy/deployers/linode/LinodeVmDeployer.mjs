import {BaseDeployer} from "../BaseDeployer.mjs";
import {Checkbox, Input, Secret as SecretPrompt, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, formatBinary, sortByTextField, tablifyOptions, generateRandomHexString} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import { encode as b64encode } from "https://deno.land/std/encoding/base64.ts";
import * as Path from "https://deno.land/std/path/mod.ts";


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

    getStackScript() {
        const script = `#!/bin/sh
# <UDF name="user_data" label="user-data file contents (base64 encoded)" />
exec >/root/stackscript.log 2>&1
set +e +x
FILE_USERDATA="/var/lib/cloud/seed/nocloud-net/user-data"
FILE_METADATA="/var/lib/cloud/seed/nocloud-net/meta-data"
# vendor-data and network-config are optional

echo "Configuring cloud-init..."
echo "set cloud-init/datasources NoCloud" | debconf-communicate
mkdir -p /etc/cloud/cloud.cfg.d /var/lib/cloud/seed/nocloud-net/

if [ -n "$LINODE_ID" ]; then
cat > /etc/cloud/cloud.cfg.d/01-instanceid.cfg <<'EOS'
datasource:
  NoCloud:
    meta-data:
       instance-id: linode$LINODE_ID
EOS
fi

cat > /etc/cloud/cloud.cfg.d/99-warnings.cfg <<'EOS'
#cloud-config
warnings:
  dsid_missing_source: off
EOS

UMASK=$(umask)
umask 0066
echo "Creating $FILE_METADATA..."
touch "\${FILE_METADATA}"

echo "Creating $FILE_USERDATA..."
touch "\${FILE_USERDATA}"
echo "\${USER_DATA}"
echo "\${USER_DATA}" | base64 -d > "\${FILE_USERDATA}"
umask "\${UMASK}"

echo "Running cloud-init... (init, config, and final)"
cloud-init clean
cloud-init init
cloud-init modules --mode=config
cloud-init modules --mode=final
                `
        return script
    }


    async checkAvailable() {
        await super.checkAvailable();
        const cmd = this.getLinodeCommand("account", "view");
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        const linodeAccount = JSON.parse(output);
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
            if (!regions[i].capabilities.includes("Vlans")){
                regions[i]["region"] += " (No VLAN Support)"
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

    async getVpcs(region) {
        const cmd = this.getLinodeCommand("vlans", "list");
        const vpcs = JSON.parse(await execCmd(cmd));
        return vpcs.filter(v => v.region === region.id);
    }

    async selectVpc(region, hostname) {
        const vlanAvailable = await this.checkRegionVlan(region.id)
        if (!vlanAvailable) return vlanAvailable

        const vpcs = await this.getVpcs(region)
        const fields = [
            {name: "region"},
            {name: "label"},
        ]
        const options = tablifyOptions(vpcs, fields, (v) => v.label);
        options.forEach(o => o.checked = false);

        // todo: to be reviewed
        let checkedVpcs = []
        let newVlan = ""
        if (options.length !== 0) {
            checkedVpcs = await Checkbox.prompt({
                message: "Select Vlans",
                options,
                minOptions: 0,
                maxOptions: 2,
                hint: "Use spacebar to select or deselect and enter key to confirm. Maximum 2 Vlans is allowed. Select 0 to create a new Vlan."
            });
        }
        if (checkedVpcs.length === 0){
            newVlan = await Input.prompt({message: "Create new Vlan", default: hostname})
        }
        return {vlanAvailable, checkedVpcs, newVlan};
    }

    async checkRegionVlan(region){
        const cmd = this.getLinodeCommand("regions", "list");
        const vpcs = JSON.parse(await execCmd(cmd));
        return vpcs.filter(region => region.capabilities.includes("Vlans")).map(region => region.id).includes(region)
    }

    async selectInstanceType() {
        return await Select.prompt({
            message: "Select server type",
            options: [
                {name: "Shared", value: "shared"},
                {name: "Dedicated", value: "dedicated"}
            ],
            default: "shared"
        });
    }

    async getInstanceSizes() {
        const cmd = this.getLinodeCommand("linodes", "types");
        return JSON.parse(await execCmd(cmd));
    }

    async selectSize(instanceType) {
        let sizes = await this.getInstanceSizes()
        switch (instanceType) {
            case "dedicated":
                sizes = sizes.filter(size => size.gpus === 0).filter(size => size.class !== "nanode" && size.class !== "standard" );
                break
            case "shared":
                sizes = sizes.filter(size => size.gpus === 0).filter(size => size.class === "nanode" || size.class === "standard" );
                break
        }

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
        const keyNames = [];
        for await (const dirEntry of Deno.readDir(this.sshKeyDir)) {
            if ( dirEntry.isFile && dirEntry.name.endsWith(".pub") ) {
                keyNames.push({name: dirEntry.name.substring(0, dirEntry.name.length-4), path: Path.resolve(this.sshKeyDir, dirEntry.name)})
            }
        }
        sortByTextField(keyNames, "name");
        return keyNames;
    }

    async selectKeyPair(hostname) {
        const keyPairs = await this.getKeyPairs();
        //sshKeygenAvailable = await this.checkSshKeygenAvailable();

        const useKeyPair = await Select.prompt({
            message: "SSH Public Key",
            hint: "We recommend use of an SSH key pair",
            options: [
                {name: `Use new`, value: "NEW"},
                {name: `Use existing${Colors.italic(keyPairs.length === 0 ? " (none found)":"")}`, value: "EXISTING", disabled: keyPairs.length === 0},
                {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
            ],
            default: "NEW"
        });
        if ( useKeyPair === "SKIP" ) return null;
        else if ( useKeyPair === "NEW" ) {
            const keyName = await Input.prompt({message: "Key name", default: hostname});

            const keyCreated = await this.generateSshKey(keyName);
            if ( !keyCreated ) throw new Error("Could not create ssh key");
            const publicKey = await Deno.readTextFile(`${keyName}.pub`);
            return {name: keyName, path: Path.resolve(this.sshKeyDir, keyName), key: publicKey.replace("\n", "")};
        }
        else {
            const keyName = await Select.prompt({
                message: "Choose Key Pair",
                options: keyPairs.map(keyPair => ({
                    name: keyPair.name,
                    value: keyPair.name
                }))
            });
            hint: `Showing files in path: ${Path.resolve(this.sshKeyDir)}`
            const selectedKey = keyPairs.find(keyPair => keyPair.name === keyName)
            selectedKey.key = (await Deno.readTextFile(`${selectedKey.name}.pub`)).replace("\n", "")
            return selectedKey;
        }
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


    async getOrCreateStackScript(script) {
        let cmd = this.getLinodeCommand("stackscripts", "list");
        cmd.push("--label", "tg-stackscript")
        cmd.push("--is_public", "False")
        let output = JSON.parse(await execCmd(cmd));
        if (output.length === 0) {
            cmd = this.getLinodeCommand("stackscripts", "create");
            cmd.push("--label", "tg-stackscript")
            cmd.push("--images", this.image)
            cmd.push("--script", script)
            output = JSON.parse(await execCmd(cmd));
            return output[0].id;
        }
        return output[0].id
    }

    async createVm(hostname, size, region, vpcs, root_pass, authorized_key, stackscript, cloudConfig, disablePasswordAuth) {
        const cmd = this.getLinodeCommand("linodes", "create");
        cmd.push("--label", hostname)
        cmd.push("--type", size)
        cmd.push("--image", this.image)
        cmd.push("--region", region.id)
        cmd.push("--root_pass", root_pass)
        if (disablePasswordAuth){
            cmd.push("--authorized_keys", authorized_key.key)
        }
        cmd.push("--stackscript_id", stackscript)
        cmd.push("--stackscript_data", JSON.stringify({user_data: b64encode(cloudConfig)}))
        cmd.push("--private_ip", true)
        if (vpcs.vlanAvailable === true){
            if (vpcs.checkedVpcs.length === 0){
                cmd.push("--interfaces.purpose", "public" )
                cmd.push("--interfaces.label", "")
                cmd.push("--interfaces.purpose", "vlan" )
                cmd.push("--interfaces.label", vpcs.newVlan)
            } else {
                cmd.push("--interfaces.purpose", "public" )
                cmd.push("--interfaces.label", "")
                for (const vpc of vpcs.checkedVpcs){
                    cmd.push("--interfaces.purpose", "vlan" )
                    cmd.push("--interfaces.label", vpc)
                }

            }
        }

        const output = await execCmd(cmd);

        // writing root password to a file, password alone is not enough to ssh into the server
        // todo: to be reviewed
        await Deno.writeTextFile(`${hostname}.root`, root_pass)

        return output
    }


    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        const
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            region = await this.selectRegion(),
            instanceType = await this.selectInstanceType(),
            size = await this.selectSize(instanceType),
            hostname = `tg-${connector.name}`,
            vpcs = await this.selectVpc(region, hostname),
            sshKey = await this.selectKeyPair(hostname),
            root_pass = generateRandomHexString(50),
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = !this.cliOptions.accountName.includes("stg.opstg.com") ? `https://${this.cliOptions.accountName}.twingate.com`: `https://${this.cliOptions.accountName}`,
            script = this.getStackScript(),
            stackScript = await this.getOrCreateStackScript(script),
            disablePasswordAuth = sshKey !== null,
            cloudConfig = new ConnectorCloudInit({
                privateIp: `$(hostname -I)`
            })
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-linode-vm",
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                })
                .configure({
                    // sshLocalOnly: true, // disabled because we are using the Linode firewall
                    sshDisablePasswordAuthentication: disablePasswordAuth
                })

        Log.info("Creating VM, please wait.");

        cloudConfig.init.hostname = hostname;

        try {
            const createVmOut = JSON.parse(await this.createVm(hostname, size, region, vpcs, root_pass, sshKey, stackScript, cloudConfig.getConfig(), disablePasswordAuth))
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
            if (disablePasswordAuth) {
                Log.info(`${Colors.italic(`ssh -i ${sshKey.name} root@${createVmOut[0].ipv4[1]}`)}`);
            } else {
                Log.info(`${Colors.italic(`ssh root@$${createVmOut[0].ipv4[1]}`)}`);
                Log.info(`${Colors.italic(`The root password is stored at ${hostname}.root`)}`);
            }

        }
        catch (e) {
            Log.error(e);
            throw e;
        }

    }


}