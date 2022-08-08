import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Select, Checkbox, Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, formatBinary, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";

export class HCloudDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "hcloud";
        this.image = cliOptions.image || "ubuntu-22.04"; // Ubuntu 22.04 LTS
    }

    async checkAvailable() {
        await super.checkAvailable();
        const cmd = this.getHCloudCommand("context", "active", {output: null});
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        if (typeof output === "number") {
            Log.error(`'${this.cliCommand} context active' returned non-zero exit code: ${output} - please check '${this.cliCommand}' is configured correctly.`);
        }
        const account = output.replace(/[\r\n=]/g, "");
        Log.info(`Using HCloud context: ${Colors.italic(account)}`);
        return account;
    }

    getHCloudCommand(command, subCommand, options = {}) {
        let cmd = [this.cliCommand, command];

        if (typeof subCommand === "string") {
            cmd.push(subCommand);
        } else if (Array.isArray(subCommand)) {
            cmd.push(...subCommand);
        }

        if (options.name) {
            if (typeof options.name === "string") {
                cmd.push(options.name);
            } else if (Array.isArray(options.name)) {
                cmd.push(...options.name);
            }
        }

        options = Object.assign({
            output: "json",
//            context: null
        }, this.cliOptions, options);
        if (options.output != null) {
            cmd.push("-o", options.output);
        }
        return cmd;
    }

    async getDataCenters() {
        const cmd = this.getHCloudCommand("datacenter", "list");
        const dataCenters = JSON.parse(await execCmd(cmd));
        for (const dataCenter of dataCenters) {
            dataCenter.city = dataCenter.location.city;
            dataCenter.country = dataCenter.location.country;
            dataCenter.network_zone = dataCenter.location.network_zone;
        }
        return dataCenters;
    }

    async getImages() {
        const cmd = this.getHCloudCommand("images", "list");
        return JSON.parse(await execCmd(cmd));
    }


    async getServers(serverType = null, datacenter = null) {
        const cmd = this.getHCloudCommand("server-type", "list");
        let servers = JSON.parse(await execCmd(cmd));
        if ( serverType !== null ) {
            servers = servers.filter(s => s.cpu_type === serverType);
        }
        if ( datacenter !== null ) {
            const location = datacenter.location.name;
            servers = servers.filter(s => datacenter.server_types.available.includes(s.id));
            for ( const server of servers) {
                const price = server.prices.find(p => p.location === location);
                server.priceMonthly = price ? Number(price.price_monthly.net) : null;
            }
            servers = servers.filter(s => s.priceMonthly !== null);
        }
        return servers;
    }

    async getNetworks(networkZone) {
        const cmd = this.getHCloudCommand("network", "list");
        const networks = JSON.parse(await execCmd(cmd));
        return networks == null ? networks : networks.filter(v => v.subnets.some(s => s.network_zone === networkZone));
    }

    async getKeyPairs() {
        const cmd = this.getHCloudCommand("ssh-key", "list");
        const output = await execCmd(cmd);
        return JSON.parse(output) || [];
    }

    async selectDataCenter() {
        const dataCenters = await this.getDataCenters();
        const fields = [
            {name: "name"},
            {name: "network_zone"},
            {name: "description"},
            {name: "city"},
            {name: "country"}
        ]
        const options = tablifyOptions(dataCenters, fields, (v) => v.name);
        const dataCenterName = await Select.prompt({
            message: "Select data center",
            options
        });
        return dataCenters.find(dataCenter => dataCenter.name === dataCenterName);
    }

    async getPlacementGroups() {
        const cmd = this.getHCloudCommand("placement-group", "list");
        const placementGroups = JSON.parse(await execCmd(cmd));
        return placementGroups || [];
    }

    async selectServerType() {
        return await Select.prompt({
            message: "Select server type",
            options: [
                {name: "Shared", value: "shared"},
                {name: "Dedicated", value: "dedicated"}
            ],
            default: "shared"
        });
    }

    async selectServer(serverType, datacenter) {
        let servers = await this.getServers(serverType, datacenter);
        const priceFormatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'EUR'
        });

        const fields = [
            {name: "description"},
            {name: "cores", formatter: (v) => `${v} CPU`},
            {name: "memory", formatter: (v) => (formatBinary(v, "GB"))},
            {name: "disk", formatter: (v) => (formatBinary(v, "GB"))},
            {name: "priceMonthly", formatter: priceFormatter.format}
        ]
        const options = tablifyOptions(servers, fields, (v) => v.name);
        const serverName = await Select.prompt({
            message: "Select server",
            options,
            default: "cx11",
            hint: "Only available sizes are shown."
        });
        return servers.find(s => s.name === serverName);
    }

    async selectNetworks(networkZone) {
        const networks = await this.getNetworks(networkZone);
        if ( networks.length === 0 ) return networks;
        const fields = [
            {name: "name"},
            {name: "ip_range"}
        ]
        const options = tablifyOptions(networks, fields, (v) => v.name);
        options.forEach(o => o.checked = true);
        const networkNames = await Checkbox.prompt({
            message: "Select networks",
            options
        });
        return networks.filter(n => networkNames.includes(n.name));
    }

    async selectPlacementGroup() {
        const placementGroups = await this.getPlacementGroups();
        if ( placementGroups.length === 0 ) return null;
        placementGroups.splice(0, 0, {name: "NONE", type: "-"})
        const fields = [
            {name: "name"},
            {name: "type"}
        ]
        const options = tablifyOptions(placementGroups, fields, (v) => v.name);
        const defaultPlacementGroup = placementGroups.find(p => p.labels && p.labels.service === "twingate");
        const placementGroupName = await Select.prompt({
            message: "Select placement group",
            options,
            default: defaultPlacementGroup ? defaultPlacementGroup.name : "NONE"
        });
        return placementGroupName === "NONE" ? null : placementGroups.find(p => p.name === placementGroupName);
    }


    async selectPublicIp(networks) {
        const hasPrivateNetworks = networks.length > 0;

        const options = [
            {name: "IPv6 and IPv4", value: "both"},
            {name: `IPv6 Only${hasPrivateNetworks ? Colors.italic(" (recommended)") : ""}`, value: "ipv6Only"},
            {name: "IPv4 Only", value: "ipv4Only"},
            {name: "No public IP (not recommended)", value: "none"}
        ];

        const publicIpOption = await Checkbox.prompt({
            message: "Select public IP",
            options,
            default: hasPrivateNetworks ? "ipv6Only" : "both"
        });
        return publicIpOption;
    }

    async createSshKey(keyName) {
        const keyCreated = await this.generateSshKey(keyName);
        if (!keyCreated) {
            throw new Error("Could not create ssh key");
        }
        const publicKey = await Deno.readTextFile(`${keyName}.pub`);
        const cmd = this.getHCloudCommand("ssh-key", "create", {output: null});
        cmd.push("--name", keyName);
        cmd.push("--public-key", publicKey);
        let [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        if ( code !== 0 ) throw new Error(error);
        return keyName;
    }

    async selectKeyPair(defaultKeyName) {
        const keyPairs = await this.getKeyPairs(),
            sshKeygenAvailable = await this.checkSshKeygenAvailable();

        const useKeyPair = await Select.prompt({
            message: "SSH Public Key",
            hint: "We recommend use of an SSH key pair",
            options: [
                {name: `Use new${Colors.italic(!sshKeygenAvailable ? " (ssh-keygen not available)" : "")}`, value: "NEW", disabled: !sshKeygenAvailable},
                {name: `Use existing${Colors.italic(keyPairs.length === 0 ? " (none available)" : "")}`, value: "EXISTING", disabled: keyPairs.length === 0},
                {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
            ],
            default: "NEW"
        });
        if (useKeyPair === "SKIP") {
            return null;
        } else if (useKeyPair === "NEW") {
            const keyName = await Input.prompt({message: "Key name", default: defaultKeyName});
            return await this.createSshKey(keyName);
        } else {
            const keyName = await Select.prompt({
                message: "Choose Key Pair",
                options: keyPairs.map(keyPair => ({name: keyPair.name, value: keyPair.name}))
            });
            return keyName;//keyPairs.find(keyPair => keyPair.name === keyName);
        }
    }

    async selectSetupAsNatRouter(networks) {
        if ( networks.length === 0 ) return false;
        return await Confirm.prompt({
            message: "Configure as NAT router?",
            default: true,
            hint: "If yes (default) then other machines on your private network can use this machine to route outbound traffic."
        });
    }

    async selectEnableFirewall() {
        return await Confirm.prompt({
            message: "Enable firewall?",
            default: true,
            hint: "If yes (default) then sets up ufw to allow ssh only."
        });
    }

    async createVm(dataCenter, location, name, networks=[], placementGroup = null, primaryIpv4 = null, sshKey, serverType, cloudConfigFile) {
        const cmd = this.getHCloudCommand("server", "create", {output: null});
        cmd.push("--datacenter", dataCenter);
        cmd.push("--image", this.image);
        cmd.push("--label", "service=twingate");
        //cmd.push("--location", location);
        cmd.push("--name", name);
        for ( const network of networks) cmd.push("--network", network.name);
        if ( placementGroup != null ) cmd.push("--placement-group", placementGroup.name);
        if ( primaryIpv4 != null ) cmd.push("--primary-ipv4", primaryIpv4);
        // Disable IPv6
        cmd.push("--without-ipv6");
        if ( sshKey != null) cmd.push("--ssh-key", sshKey);
        cmd.push("--type", serverType);
        cmd.push("--user-data-from-file", cloudConfigFile);

        let [code, output, error] = await execCmd2(cmd, {tee: true});
        if ( code === 0 ) {
            try {
                const id = /^Server ([0-9]*) created$/gm.exec(output)[1];
                let publicIp = null;
                try { publicIp = /^IPv4: (.*)$/gm.exec(output)[1]; } catch (e) {}
                let privateIp = undefined;
                try { privateIp = /^Private Networks:\n	- ([0-9\.]*) /gm.exec(output)[1]; } catch (e) {}
                output = {id, publicIp, privateIp};
            }
            catch (e) {
                Log.error("Error parsing output: " + e);
            }
        }
        return [code, output, error];
    }

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        const
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            dataCenter = await this.selectDataCenter(),
            serverType = await this.selectServerType(),
            server = await this.selectServer(serverType, dataCenter),
            hostname = `tg-${connector.name}`,
            networks = await this.selectNetworks(dataCenter.network_zone),
            placementGroup = await this.selectPlacementGroup(),
            primaryIpv4 = null, // TODO
            sshKey = await this.selectKeyPair(hostname),
            setupAsNatRouter = false, //await this.selectSetupAsNatRouter(networks),
            enableFirewall = await this.selectEnableFirewall(),
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            cloudConfig = new ConnectorCloudInit({
                    // https://docs.hetzner.com/cloud/networks/server-configuration
                    // ens10 - CX and CCX*1 (Intel CPU)
                    // enp7s0 - CPX and CCX*2 (AMD CPU)
                    privateInterface: /^CX.*|CCX.+1$/i.test(server.name) ? "ens10" : "enp7s0"
                })
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-hetzner-vm",
                    datacenter: dataCenter.name,
                    location: dataCenter.location.name,
                    zone: dataCenter.network_zone,
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                })
                .configure({
                    setupAsNatRouter,
                    enableFirewall,
                    sshLocalOnly: networks.length > 0
                }),
            cloudConfigFile = await Deno.makeTempFile({dir: "./", prefix: `CloudConfig-${hostname}`, suffix: ".yaml"})
        ;

        Log.info("Creating VM, please wait.");

        try {
            await Deno.writeTextFile(cloudConfigFile, cloudConfig.getConfig());
            const [code, instance, error] = await this.createVm(dataCenter.name, dataCenter.location.name, hostname, networks, placementGroup, primaryIpv4, sshKey, server.name, cloudConfigFile);
            if (code !== 0) {
                Log.failure(error);
                return 1;
            }
            Log.success(`Created Hetzner Cloud VM!\n`);
            if (typeof instance === "object") {
                const table = new Table();
                table.push(["Id", instance.id]);
                table.push(["Name", hostname]);
                table.push(["Private IP", instance.privateIp]);
                table.push(["Public IP", instance.publicIp]);
                table.render();

                if (!instance.privateIp) return;

                Log.info(`Please allow a few minutes for the instance to initialize. You should then be able to add the private IP as a resource in Twingate.`);
                Log.info(`You can do this via the Admin Console UI or via the CLI:`);
                Log.info(Colors.italic(`tg resource create "${remoteNetwork.name}" "Connector host ${hostname}" "${instance.privateIp}" Everyone`));
                Log.info(`Once done and authenticated to Twingate you can connect to the instance via SSH using the following command:`);
                if (sshKey) {
                    Log.info(`${Colors.italic(`ssh -i ${sshKey} root@${instance.privateIp}`)}`);
                } else {
                    Log.info(`${Colors.italic(`ssh root@${instance.privateIp}`)}`);
                }

            }
            return 0;
        } catch (e) {
            Log.error(e);
            throw e;
        }
        finally {
            await Deno.remove(cloudConfigFile);
        }
    }
}