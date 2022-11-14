import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class K8sHelmDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.helmRepo = cliOptions.helmRepo || "https://twingate.github.io/helm-charts";
        this.namespace = cliOptions.namespace || "twingate";
        this.numConnectors = cliOptions.numConnectors || 2;
        this.cliCommand = "helm";
        this.kubectlCommand = "kubectl";
    }

    async checkAvailable(cmd = [this.cliCommand, "--version"]) {
        await super.checkAvailable([this.cliCommand, "version"]);
        await super.checkAvailable([this.kubectlCommand, "version"]);
    }

    getKubeCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.kubectlCommand, command];

        if (typeof subCommand === "string") cmd.push(subCommand);
        else if (Array.isArray(subCommand)) cmd.push(...subCommand);

        let context = options.context || cliOptions.context;
        if ( typeof context === "object") context = context.name;
        if (!options.noContext && context != null) cmd.push("--context", context);
        if (!options.noFormat) cmd.push("-o", options.format || "json");
        return cmd;
    }

    getHelmCommand(command, subCommand = null, options = {}) {
        let cmd = [this.cliCommand, command];

        if (typeof subCommand === "string") cmd.push(subCommand);
        else if (Array.isArray(subCommand)) cmd.push(...subCommand);

        if (!options.noFormat) cmd.push("-o", options.format || "json");
        return cmd;
    }

    async getKubeContexts() {
        const cmd = this.getKubeCommand("config", ["get-contexts", "--no-headers"], {noFormat: true, noContext: true}),
            output = await execCmd(cmd),
            contexts = output
                .split("\n")
                .filter((p) => p.trim())
                .map(line => {
                    let fields = line.split(/\s+/);
                    return {
                        current: (fields[0].trim() === "*" ? "Yes" : "No"),
                        name: fields[1].trim(),
                        cluster: fields[2].trim(),
                        authInfo: fields[3].trim(),
                        namespace: fields[4].trim(),
                    }
                })

        ;
        return contexts;
    }

    async getKubeClusterEndpoint(clusterName, context) {
        const getEndpointCmd = this.getKubeCommand("config", "view", {format: `jsonpath='{.clusters[?(@.name=="${clusterName}")].cluster.server}'`, context})
        const [code, output, error] = await execCmd2(getEndpointCmd);
        if (code !== 0) {
            throw new Error(`CLI output for 'getKubeClusterEndpoint' returned non-zero status ${code}: ${output}`);
        }
        const url = new URL(output.slice(1, -1));
        let port = url.port === "" ? 443 : parseInt(url.port, 10);
        return {host: url.hostname, port};
    }
    async getKubeClusterDomain(context=null) {
        const subCommand = ["configmaps", "cluster-dns", "--namespace", "kube-system"];
        const getClusterDomainCmd = this.getKubeCommand("get", subCommand, {format: "jsonpath={.data.clusterDomain}", context});
        const [code, output, error] = await execCmd2(getClusterDomainCmd);
        if (code !== 0) {
            throw new Error(`CLI output for 'getKubeClusterDomain' returned non-zero status ${code}: ${output}`);
        }
        return output;
    }

    async getKubeNamespaces(context=null) {
        const getNamespacesCmd = this.getKubeCommand("get", "namespaces", {format: "jsonpath={.items[*].metadata.name}", context});
        const [code, output, error] = await execCmd2(getNamespacesCmd);
        if (code !== 0) {
            throw new Error(`CLI output returned non-zero status ${code}: ${output}`);
        }
        return output.trim().split(/\s+/);
    }

    async addHelmRepo() {
        const addRepoCmd = this.getHelmCommand("repo", ["add", "twingate", this.helmRepo, "--force-update"], {noFormat: true});
        Log.info(`Adding helm repo '${this.helmRepo}'`);
        const [code, output, error] = await execCmd2(addRepoCmd);
        if (code !== 0) {
            throw new Error(`CLI output returned non-zero status ${code}: ${output}`);
        }
        Log.info(`... ${output}`);
        return code;
    }

    async installHelmChart(connector, tokens, context) {
        const releaseName = `tg-${connector.name}`;
        Log.info(`Installing helm release '${releaseName}'...`);
        const subCommand = [releaseName, "twingate/connector", "--install"];
        subCommand.push("--kube-context", context.name);
        if (this.namespace) {
            subCommand.push("-n", this.namespace, "--create-namespace");
        }
        const helmParams = {
            connector: {
                network: this.client.networkName,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
            additionalLabels: {
                app: "twingate-connector"
            },
            affinity: {
                podAntiAffinity: {
                    preferredDuringSchedulingIgnoredDuringExecution: [{
                        weight: 1,
                        podAffinityTerm: {
                            labelSelector: {
                                matchExpressions: [{key: "app", operator: "In", values: ["twingate-connector"]}]
                            },
                            topologyKey: "kubernetes.io/hostname"
                        }
                    }]
                }
            }
        }
        const jsonParam = Object.entries(helmParams)
            .map(([key, value]) => (`${key}=${JSON.stringify(value)}`))
            .join(",")
        ;
        subCommand.push("--set-json", jsonParam);
        const installCmd = this.getHelmCommand("upgrade", subCommand);
        const [code, output, error] = await execCmd2(installCmd);
        if (code !== 0) {
            throw new Error(`CLI output returned non-zero status ${code}: ${output}`);
        }
        return output;
    }

    async selectKubeContext() {
        const contexts = await this.getKubeContexts();
        if (contexts.length === 0) {
            throw new Error("No kubernetes contexts found");
        }
        if (contexts.length === 1) {
            const context = contexts[0];
            Log.info(`Using context '${context.name}'`);
            return context;
        }
        if (this.cliOptions.context) {
            const context = contexts.find(c => c.name === this.cliOptions.context);
            if (context !== undefined) {
                Log.info(`Using context '${context.name}'`);
                return context;
            }
            Log.warn(`Context '${this.cliOptions.context}' not found`);
        }
        const fields = [
            {name: "current"},
            {name: "name"},
            {name: "cluster"},
            {name: "authInfo"},
            {name: "namespace"}
        ]
        const defaultContext = contexts.find(c => c.current === "Yes");
        const options = tablifyOptions(contexts, fields, (v) => v.name);
        const kubeContext = await Select.prompt({
            message: "Select kube context",
            default: defaultContext ? defaultContext.name : undefined,
            options
        });
        return contexts.find(c => c.name === kubeContext);
    }

    async deployConnectors(remoteNetwork, context, numConnectors = this.numConnectors) {
        const client = this.client,
              releases = []
        ;
        for (let x = 0; x < numConnectors; x++) {
            const connector = await client.createConnector(remoteNetwork.id),
                  tokens = await client.generateConnectorTokens(connector.id),
                  release = await this.installHelmChart(connector, tokens, context)
            ;
            releases.push(release);
        }
        return releases;
    }

    async doInitialSetup(remoteNetwork, context, confirm=true) {
        const clusterDomain = await this.getKubeClusterDomain(),
              namespaces = await this.getKubeNamespaces(),
              endpoint = await this.getKubeClusterEndpoint(context.cluster, context),
              resources = []
        ;
        resources.push({
            name: `${context.cluster} API`,
            address: endpoint.host,
            protocols: {
                    allowIcmp: false,
                    tcp: {policy: "RESTRICTED", ports: [{start: endpoint.port, end: endpoint.port}]},
                    udp: {policy: "RESTRICTED", ports: []}
            },
            group: `${context.cluster} - API Users`
        });
        resources.push({
            name: `${context.cluster} - All`,
            address: `*.${clusterDomain}`,
            group: `${context.cluster} - All`,
            protocols: null
        });
        namespaces.forEach(namespace => resources.push({
            name: `${context.cluster} - ns ${namespace}`,
            address: `*.${namespace}.${clusterDomain}`,
            group: `${context.cluster} - ns ${namespace}`,
            protocols: null
        }));
        const table = new Table()
            .header(["Resource Name", "Address", "Group Name"])
            .body(resources.map(r => [r.name, r.address, r.group]))
            .render()
        ;
        if ( confirm ) {
            const options = [
                {value: "yes", name: "Yes, create Groups and Resources"},
                {value: "resources_only", name: "Yes, create Resources only"},
                {value: "no", name: "No"}
            ];
            let creationOption = await Select.prompt({message: `Would you like to create the Groups and/or Resources above?`, options});
            switch (creationOption) {
                case "yes":
                    for (const resource of resources ) {
                        if ( !resource.group ) resource.groupId=[];
                        Log.info(`Creating group: ${resource.group}...`);
                        resource.groupIds = [(await this.client.createGroup(resource.group)).id];
                    }
                    // Fall through intentional
                case "resources_only":
                    for (const resource of resources ) {
                        Log.info(`Creating resource: ${resource.name}...`);
                        resource.tg_resource = await this.client.createResource(resource.name, resource.address, remoteNetwork.id, resource.protocols, resource.groupIds);
                    }
                    break;
                case "no":
                    // NoOp
                default:
                    break;
            }
            return resources;
        }
    }

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        const
            context = await this.selectKubeContext(),
            repoAddStatus = await this.addHelmRepo(),
            remoteNetwork = await this.selectRemoteNetwork(context.name),
            connectors = await this.deployConnectors(remoteNetwork, context),
            initialSetup = await this.doInitialSetup(remoteNetwork, context)
        ;
        Log.info(`Connectors deployed, note to uninstall releases you can run the following from a *nix shell:`);
        Log.info(Colors.italic(`${this.cliCommand} del $(helm ls --short -n ${this.namespace}) -n ${this.namespace}`));

    }
}