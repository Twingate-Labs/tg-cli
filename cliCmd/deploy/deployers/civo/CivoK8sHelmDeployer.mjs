import {K8sHelmDeployer} from "../k8s/K8sHelmDeployer.mjs";
import {Select, Toggle} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, tablifyOptions, delay} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class CivoK8sHelmDeployer extends K8sHelmDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.civoCommand = "civo";
    }

    async checkAvailable() {
        await super.checkAvailable(null);
        await super.checkAvailable([this.civoCommand, "--version"]);
    }

    getCivoCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.civoCommand, command];

        if (typeof subCommand === "string") cmd.push(subCommand);
        else if (Array.isArray(subCommand)) cmd.push(...subCommand);

        if ( options.region ) cmd.push("--region", options.region);
        if (!options.noFormat) cmd.push("-o", options.format || "json");
        return cmd;
    }

    async getCivoRegions() {
        const getRegionsCmd = this.getCivoCommand("regions", "ls");
        const [code, output, error] = await execCmd2(getRegionsCmd);
        if (code !== 0) {
            throw new Error(`CLI output for 'getCivoRegions' returned non-zero status ${code}: ${output}`);
        }
        return JSON.parse(output);
    }

    async getCivoClusters(region) {
        const getRegionsCmd = this.getCivoCommand("kubernetes", "ls", {region: region ? region.code : null});
        const ret = await Promise.race([delay(10000), execCmd2(getRegionsCmd)]);
        if ( !ret ) {
            Log.error(`CLI command timed out: ${getRegionsCmd.join(' ')}`);
            return [];
        }
        const [code, output, error] = ret;
        if (code !== 0) {
            throw new Error(`CLI output for 'getCivoClusters' returned non-zero status ${code}: ${output}`);
        }
        return JSON.parse(output);
    }

    async getCivoClusterInfo(civoClusterId, region) {
        const getClusterInfoCmd = this.getCivoCommand("kubernetes", ["show", civoClusterId], {region: region ? region.code : null});
        const [code, output, error] = await execCmd2(getClusterInfoCmd);
        if (code !== 0) {
            throw new Error(`CLI output for 'getCivoClusterInfo' returned non-zero status ${code}: ${output}`);
        }
        return JSON.parse(output);
    }

    async getCivoFirewallRules(firewallId, region) {
        const getFirewallRulesCmd = this.getCivoCommand("firewall", ["rule", "ls", firewallId], {region: region ? region.code : null});
        const [code, output, error] = await execCmd2(getFirewallRulesCmd);
        if (code !== 0) {
            throw new Error(`CLI output for 'getCivoFirewallRules' returned non-zero status ${code}: ${output}`);
        }
        return JSON.parse(output);
    }

    async removeCivoFirewallRule(firewallId, ruleId, region) {
        const removeFirewallRuleCmd = this.getCivoCommand("firewall", ["rule", "remove", firewallId, ruleId, "--yes"], {region: region ? region.code : null});
        const [code, output, error] = await execCmd2(removeFirewallRuleCmd);
        if (code !== 0) {
            throw new Error(`CLI output for 'removeCivoFirewallRule' returned non-zero status ${code}: ${output}`);
        }
        return JSON.parse(output);
    }

    async selectCivoRegion() {
        const regions = await this.getCivoRegions();
        if (this.cliOptions.region) {
            const region = regions.find(r => r.code === this.cliOptions.region);
            if (region !== undefined) {
                Log.info(`Using region '${region.code}'`);
                return region;
            }
            Log.warn(`Region '${this.cliOptions.region}' not found`);
        }
        const fields = [
            {name: "code"},
            {name: "name"},
            {name: "country"}
        ]
        const defaultRegion = regions.find(c => c.current === "Yes");
        const options = tablifyOptions(regions, fields, (v) => v.code);
        const civoRegion = await Select.prompt({
            message: "Select region",
            default: defaultRegion ? defaultRegion.code : undefined,
            options
        });
        return regions.find(c => c.code === civoRegion);
    }

    async selectCivoCluster(region=null) {
        const clusters = await this.getCivoClusters(region);
        if (clusters.length === 0) {
            throw new Error("No Civo clusters found in region");
        }
        let cluster = null;
        if (this.cliOptions.cluster) {
            cluster = clusters.find(c => c.name === this.cliOptions.cluster);
            if (cluster !== undefined) {
                Log.info(`Using cluster '${cluster.name}'`);
                return cluster;
            }
            Log.warn(`Cluster '${this.cliOptions.cluster}' not found`);
        }
        else if ( clusters.length === 1 ) {
            cluster = clusters[0];
            Log.info(`Using cluster '${cluster.name}' (only cluster in region)`);
        }
        else {
            const fields = [
                {name: "name"},
                {name: "nodes"},
                {name: "pools"},
                {name: "status"}
            ]
            const options = tablifyOptions(clusters, fields, (v) => v.id, (v) => v.status !== "ACTIVE");
            const civoClusterId = await Select.prompt({
                message: "Select cluster",
                options
            });
            cluster = clusters.find(c => c.id === civoClusterId);
        }
        if ( cluster === null) throw new Error("Civo cluster unexpectedly null");
        const clusterInfo = await this.getCivoClusterInfo(cluster.id, region);
        this.cliOptions.context = clusterInfo.name;
        if (clusterInfo.kubeconfig) {
            this.kubeConfigContent = clusterInfo.kubeconfig;
        }
        return clusterInfo;
    }

    async lockDownFirewall(civoCluster, region) {
        Log.info("Checking firewall...");
        const firewallId = civoCluster.firewall_id,
              rules = await this.getCivoFirewallRules(firewallId, region),
              inboundRules = rules.filter(rule => rule.action === "allow" && rule.direction === "ingress"),
              message = "Confirm removal of the above ingress rules?",
              hint = "If you confirm your cluster will be secured and the only way to access it will be via Twingate."
        ;
        const table = new Table()
            .header(["Action", "CIDR", "Direction", "Label"])
            .body(inboundRules.map(r => [r.action, r.cidr, r.direction, r.label]))
            .render()
        ;
        if ( await Toggle.prompt({message, hint}) ) {
            Log.info("Restricting firewall...");
            return await Promise.all(inboundRules.map(rule => this.removeCivoFirewallRule(firewallId, rule.id, region)));
        }
        return [];
    }

    async deploy() {
        await this.checkAvailable();
        const
            region = await this.selectCivoRegion(),
            civoCluster = await this.selectCivoCluster(region)
        ;

        const externalUsersGroupName = `Civo ${civoCluster.name} - External users`;
        this.resources.push({
            name: `Civo ${civoCluster.name} (IP) - HTTP(S)`,
            address: civoCluster.master_ip,
            protocols: {
                    allowIcmp: false,
                    tcp: {policy: "RESTRICTED", ports: [{start: 80, end: 80}, {start: 443, end: 443}]},
                    udp: {policy: "RESTRICTED", ports: [{start: 80, end: 80}, {start: 443, end: 443}]}
            },
            group: externalUsersGroupName
        });
        this.resources.push({
            name: `Civo ${civoCluster.name} (DNS) - HTTP(S)`,
            address: civoCluster.dns_entry,
            protocols: {
                    allowIcmp: false,
                    tcp: {policy: "RESTRICTED", ports: [{start: 80, end: 80}, {start: 443, end: 443}]},
                    udp: {policy: "RESTRICTED", ports: [{start: 80, end: 80}, {start: 443, end: 443}]}
            },
            group: externalUsersGroupName
        });
        await super.deploy();
        if ( this.deployed ) {
            await this.lockDownFirewall(civoCluster, region);
        }
        Log.success(`Twingate deployed to Civo cluster ${civoCluster.name} and firewall rules locked down`);
    }
}