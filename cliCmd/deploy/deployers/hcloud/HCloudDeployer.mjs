import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, formatBinary, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";

export class HCloudDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "hcloud";
        //this.dropletImage = cliOptions.dropletImage || 112929408; // Ubuntu 22.04 LTS
    }

    async checkAvailable() {
        await super.checkAvailable();
        const cmd = this.getHCloudCommand("context", "active");
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        if ( typeof output === "number" ) {
            Log.error(`'${this.cliCommand} context active' returned non-zero exit code: ${output} - please check '${this.cliCommand}' is configured correctly.`);
        }
        const account = output.replace(/[\r\n=]/g, "");
        Log.info(`Using HCloud context: ${Colors.italic(account)}`);
        return account;
    }

    getHCloudCommand(command, subCommand, options = {}) {
        let cmd = [this.cliCommand, command];

        if (typeof subCommand === "string") cmd.push(subCommand);
        else if ( Array.isArray(subCommand) ) cmd.push(...subCommand);

        if ( options.name ) {
            if (typeof options.name === "string") cmd.push(options.name);
            else if ( Array.isArray(options.name) ) cmd.push(...options.name);
        }

        options = Object.assign({
//            output: "json",
//            context: null
        }, this.cliOptions, options);
        if (options.output != null) {
            cmd.push("-o", options.output);
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
        const cmd = this.getDoComputeCommand("region", "list");
        return JSON.parse(await execCmd(cmd)).filter(r => r.available);
    }

    async getVpcs(region = null) {
        const cmd = this.getDoComputeCommand("region", "list");
        const vpcs = JSON.parse(await execCmd(cmd));
        return region == null ? vpcs : vpcs.filter(v => v.region === region);
    }

    async getKeyPairs() {
        const cmd = this.getDoComputeCommand("ssh-key", "list");
        const output = await execCmd(cmd);
        return JSON.parse(output);
    }

    async getInstanceSizes() {
        const cmd = this.getDoComputeCommand("size", "list");
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

    async selectVpc(region) {
        const vpcs = await this.getVpcs(region ? region.slug : null);
        if ( vpcs.length === 1 ) return vpcs[0];
        else if ( vpcs.length === 0 ) return null;

        const fields = [
            {name: "region"},
            {name: "name"},
            {name: "ip_range"}
        ]
        const options = tablifyOptions(vpcs, fields, (v) => v.id);
        const vpcId = await Select.prompt({
            message: "Select VPC",
            options,
            default: vpcs.find(v => v.default === true),
            hint: "There are multiple VPCs in this region."
        });
        return vpcs.find(vpc => vpc.id === vpcId);
    }

    async createSshKey(keyName) {
        const keyCreated = await this.generateSshKey(keyName);
        if ( !keyCreated ) throw new Error("Could not create ssh key");
        const publicKey = await Deno.readTextFile(`${keyName}.pub`);
        const cmd = this.getDoComputeCommand("ssh-key", "create", {name: keyName});
        cmd.push("--public-key", publicKey);
        const output = await execCmd(cmd);
        const response = JSON.parse(output)[0];
        Log.info(`Created key '${response.name}' with id '${response.id}'`)
        return response;
    }

    async selectKeyPair(defaultKeyName) {
        const keyPairs = await this.getKeyPairs(),
              sshKeygenAvailable = await this.checkSshKeygenAvailable();

        const useKeyPair = await Select.prompt({
            message: "SSH Public Key",
            hint: "We recommend use of an SSH key pair",
            options: [
                {name: `Use new${Colors.italic( !sshKeygenAvailable ? " (ssh-keygen not available)":"")}`, value: "NEW", disabled: !sshKeygenAvailable},
                {name: `Use existing${Colors.italic(keyPairs.length === 0 ? " (none available)":"")}`, value: "EXISTING", disabled: keyPairs.length === 0},
                {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
            ],
            default: "NEW"
        });
        if ( useKeyPair === "SKIP" ) return null;
        else if ( useKeyPair === "NEW" ) {
            const keyName = await Input.prompt({message: "Key name", default: defaultKeyName});
            return await this.createSshKey(keyName);
        }
        else {
            const keyFingerprint = await Select.prompt({
                message: "Choose Key Pair",
                options: keyPairs.map(keyPair => ({name: keyPair.name, value: keyPair.fingerprint}))
            });
            return keyPairs.find(keyPair => keyPair.fingerprint === keyFingerprint);
        }
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

    async createVm(name, region, size, sshKey, vpcUuid, cloudConfig) {
        const cmd = this.getDoComputeCommand("droplet", "create", {name});
        cmd.push("--enable-monitoring");
        cmd.push("--enable-private-networking");
        cmd.push("--image", this.dropletImage);
        cmd.push("--region", region.slug);
        cmd.push("--size", size);
        cmd.push("--tag-name", "twingate");
        if ( sshKey !== null ) cmd.push("--ssh-keys", sshKey.id);
        cmd.push("--user-data", cloudConfig);
        cmd.push("--wait");
        if ( vpcUuid !== null ) cmd.push("--vpc-uuid", vpcUuid);
        let [code, output, error] = await execCmd2(cmd);
        if ( code === 0 ) {
            output = JSON.parse(output)[0];
        }
        return [code, output, error];
    }
    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        return;
        const
            //project = await this.getCurrentProject(),
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            region = await this.selectRegion(),
            vpc = await this.selectVpc(region),
            size = await this.selectSize(region),
            hostname = `tg-${connector.name}`,
            sshKey = await this.selectKeyPair(hostname),
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            cloudConfig = new ConnectorCloudInit()
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-digitalocean-vm",
                    region: region.slug,
                    vpc: vpc == null ? null : vpc.name,
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                })
                .configure({sshLocalOnly: true})
        ;

        Log.info("Creating VM, please wait.");

        try {
            const [code, droplet, error] = await this.createVm(hostname, region, size, sshKey, vpc ? vpc.id : null, cloudConfig.getConfig());
            if ( code !== 0 ) throw new Error(error);
            Log.success(`Created Droplet VM!\n`);
            if ( typeof droplet === "object") {
                const a = 1;
                droplet.privateIp = droplet.networks.v4.find(network => network.type === "private");
                droplet.publicIp = droplet.networks.v4.find(network => network.type === "public");
                const table = new Table();
                table.push(["Id", droplet.id]);
                table.push(["Name", droplet.name]);
                table.push(["Region", droplet.region.slug]);
                table.push(["Private IP", droplet.privateIp.ip_address]);
                table.push(["Public IP", droplet.publicIp.ip_address]);
                table.render();

                Log.info(`Please allow a few minutes for the instance to initialize. You should then be able to add the private IP as a resource in Twingate.`);
                Log.info(`You can do this via the Admin Console UI or via the CLI:`);
                Log.info(Colors.italic(`tg resource create "${remoteNetwork.name}" "Connector host ${droplet.name}" "${droplet.privateIp.ip_address}" Everyone`));
                Log.info(`Once done and authenticated to Twingate you can connect to the instance via SSH using the following command:`);
                if (sshKey) {
                    Log.info(`${Colors.italic(`ssh -i ${sshKey.name} root@${droplet.privateIp.ip_address}`)}`);
                }
                else {
                    Log.info(`${Colors.italic(`ssh root@${droplet.privateIp.ip_address}`)}`);
                }

            }
            return 0;
        }
        catch (e) {
            Log.error(e);
            throw e;
        }
    }
}