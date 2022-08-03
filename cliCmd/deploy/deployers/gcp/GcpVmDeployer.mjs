import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";

export class GcpVmDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "gcloud";
    }

    getGCloudCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if (typeof subCommand === "string") {
            cmd.push(subCommand);
        }
        if (cliOptions.project != null) {
            cmd.push("--project", cliOptions.project);
        }
        cmd.push("--format", options.format || "json");
        return cmd;
    }

    getGCloudComputeCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, "compute", command];
        if (typeof subCommand === "string") cmd.push(subCommand);
        else if ( Array.isArray(subCommand) ) cmd.push(...subCommand);

        if ( options.name ) {
            if (typeof options.name === "string") cmd.push(options.name);
            else if ( Array.isArray(options.name) ) cmd.push(...options.name);
        }

        if (cliOptions.project != null) {
            cmd.push("--project", cliOptions.project);
        }
        if ( options.sort ) cmd.push("--sort-by", options.sort);
        if ( options.filter ) cmd.push("--filter", options.filter);
        cmd.push("--format", options.format || "json");
        return cmd;
    }

    async getCurrentProject() {
        const cmd = this.getGCloudCommand("config", "list");
        const output = await execCmd(cmd);
        const account = JSON.parse(output).core;
        if (typeof account !== "object") {
            Log.error("Unable to fetch project, check that you are logged in to GCloud.");
            throw new Error("Not able to get project");
        }
        Log.info(`Using GCP account '${account.account}' and project '${account.project}'.`)
        return account;
    }

    async getDefaultZone() {
        const cmd = this.getGCloudCommand("config", "get");
        cmd.push("compute/zone");
        const zone = JSON.parse(await execCmd(cmd));
        if ( typeof zone !== "string") return undefined;
        return zone;
    }

    async getImageName() {
        // gcloud compute images list --filter="family:ubuntu-2204-lts AND architecture:X86_64" --format="value(name)"
    }

    async createVm(name, network, subnet, zone, nat, machineType, cloudConfigFile) {
        const cmd = this.getGCloudComputeCommand("instances", "create", {name});
        cmd.push("--network", network);
        cmd.push("--subnet", subnet);
        cmd.push("--zone", zone);
        cmd.push("--image-family", "ubuntu-2204-lts");
        cmd.push("--image-project", "ubuntu-os-cloud");
        if ( nat.length > 0 ) {
            cmd.push("--no-address");
        }
        cmd.push("--metadata-from-file", `user-data=${cloudConfigFile}`);

        const [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        return [code, output, error];

    }
    async getNetworks() {
        const cmd = this.getGCloudComputeCommand("networks", "list", {
            format: "json(selfLink.scope())",
            sort: "selfLink"
        });
        let output = JSON.parse(await execCmd(cmd));
        const zones = output.map(o => o.selfLink);
        return zones;
    }

    async getZones(region=null) {
        const cmd = this.getGCloudComputeCommand("zones", "list", {
            format: "json(selfLink.scope(), region.scope())",
            filter: region ? `region:${region}` : undefined,
            sort: "selfLink"
        });
        let output = JSON.parse(await execCmd(cmd));
        const zones = output.map(o => ({region: o.region, zone: o.selfLink}));
        return zones;
    }

    async checkNat(network, region) {
        // gcloud compute routers list --filter="nats:* AND network:twindemo-vpc AND region:us-west2" --format json
        const cmd = this.getGCloudComputeCommand("routers", "list", {
            filter: `nats:* AND network:${network} AND region:${region}`,
            sort: "selfLink"
        });
        let routersWithNat = JSON.parse(await execCmd(cmd));
        if ( routersWithNat.length === 0 ) {
            Log.info(`No Cloud NAT found in network '${network}' and region '${region}' - instance will be allocated a Public IP`);
            return routersWithNat;
        }
        const dcNats = routersWithNat.find(r => r.nats.find(n => n.enableEndpointIndependentMapping));
        if ( dcNats === undefined ) {
            Log.warn(`Found Cloud NAT(s) ${routersWithNat.map(r=>`'${r.name}'`).join(", ")} but none have 'enableEndpointIndependentMapping' so Direct Connect will not be available`);
            return routersWithNat;
        }
        return dcNats;
    }

    async getSubnets(network) {
        const cmd = this.getGCloudComputeCommand("networks", ["subnets", "list"], {
            format: "json(name, ipCidrRange, purpose, region.scope())",
            //filter: `region:(${region})`,
            sort: "name"
        });
        cmd.push("--network", network);
        let output = JSON.parse(await execCmd(cmd));
        //const zones = output.map(o => o.selfLink);
        return output;
    }


    async selectZone(region) {
        const zones = await this.getZones(region);
        //const options = tablifyOptions(resourceGroups, fields, (v) => v.id);
        const zone = await Select.prompt({
            message: "Select Zone",
            options: zones.map(o => o.zone),
            //search: true,
            default: await this.getDefaultZone()
        });
        return zones.find(z => z.zone === zone);
    }


    async selectNetwork() {
        const options = await this.getNetworks();
        const network = await Select.prompt({
            message: "Select GCP Network",
            options
        });
        return network;
    }


    async selectSubnet(network) {
        const subnets = await this.getSubnets(network);
        const fields = [
            {name: "name"},
            {name: "ipCidrRange"},
            {name: "purpose"},
            {name: "region"}
        ]
        const options = tablifyOptions(subnets, fields, (v) => v.ipCidrRange);
        const subnetCidr = await Select.prompt({
            message: "Select subnet",
            options
        });
        return subnets.find(s => s.ipCidrRange === subnetCidr);
    }

    async selectVirtualNetwork(resourceGroupName) {
        const vnets = await this.getVirtualNetworks(resourceGroupName);
        if (vnets.length === 0) {
            Log.error("No vnets found");
            throw new Error("Cannot continue - no virtual networks");
        } else if (vnets.length === 1) {
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

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        const
            machineType = this.cliOptions.size || "n1-standard-1",
            project = await this.getCurrentProject(),
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            network = await this.selectNetwork(),
            subnet = await this.selectSubnet(network),
            {region, zone} = await this.selectZone(subnet.region),
            nat = await this.checkNat(network, region),
            hostname = `tg-${connector.name}`,
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            cloudConfig = new ConnectorCloudInit()
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-gcloud-vm",
                    project: project.project,
                    network,
                    zone
                })
                .configure(),
            cloudConfigFile = await Deno.makeTempFile({dir: "./", prefix: 'CloudConfig', suffix: ".yaml"})
        ;

        Log.info("Creating VM, please wait.");

        try {
            await Deno.writeTextFile(cloudConfigFile, cloudConfig.getConfig());
            const [code, output, error] = await this.createVm(hostname, network, subnet.name, zone, nat, machineType, cloudConfigFile);
            if ( code !== 0 ) throw new Error(error);
            Log.success(`Created GCloud VM!\n`);
            return 0;
        }
        catch (e) {
            Log.error(e);
            throw e;
            return -1;
        }
        finally {
            await Deno.remove(cloudConfigFile);
        }

    }
}