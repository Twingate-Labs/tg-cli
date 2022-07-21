import {AwsBaseDeployer} from "./AwsBaseDeployer.mjs";
import {Log} from "../../../../utils/log.js";
import {execCmd} from "../../../../utils/smallUtilFuncs.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";

export class AwsEcsDeployer extends AwsBaseDeployer {

    getEcsCommand(command, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = ["aws", "ecs", command];
        options = Object.assign({
            outputJson: true,
            noPaginate: true,
            filters: null,
            query: null,
            owners: null
        }, options);
        if (cliOptions.profile != null) {
            cmd.push("--profile", cliOptions.profile);
        }
        if (cliOptions.region != null) {
            cmd.push("--region", cliOptions.region);
        }
        if (options.outputJson !== false) {
            cmd.push("--output", "json");
        }
        if (options.noPaginate !== false) {
            cmd.push("--no-paginate");
        }
        if (options.owners !== null) {
            cmd.push("--owners", options.owners);
        }
        if (options.filters !== null) {
            cmd.push("--filters", options.filters);
        }
        if (options.query !== null) {
            cmd.push("--query", options.query);
        }
        return cmd;
    }

    async getEcsClusters() {
        const cmd = this.getEcsCommand("describe-clusters");
        const output = await execCmd(cmd);
        const clusters = JSON.parse(output).clusters.filter(c => c.status === "ACTIVE");
        return clusters;
    }

    async registerEcsTaskDefinition(connectors, familyName, options={}) {
        options = Object.assign({
            image: "twingate/connector:1",
            memory: 2048,
            cpu: 1024
        }, options);
        if ( !Array.isArray(connectors)) connectors = [connectors];
        const containerDefinitions = [];
        for (const connector of connectors ) {
            const tokens = await this.client.generateConnectorTokens(connector.id);
            const containerDefinition = {
                "name": connector.name,
                "image": options.image,
                "memory": options.memory,
                "cpu": options.cpu,
                "environment": [
                    {"name": "TENANT_URL", "value": `https://${this.cliOptions.accountName}.twingate.com`},
                    {
                        "name": "ACCESS_TOKEN",
                        "value": tokens.accessToken
                    }, {
                        "name": "REFRESH_TOKEN",
                        "value": tokens.refreshToken
                    }]
            };
            containerDefinitions.push(containerDefinition);
        }
        const cmd = this.getEcsCommand("register-task-definition");
        const taskDefinition = {
            requiresCompatibilities: ["FARGATE"],
            containerDefinitions,
            volumes: [],
            networkMode: "awsvpc",
            placementConstraints: [],
            family: familyName,
            memory: `${options.memory}`,
            cpu: `${options.cpu}`
        };
        cmd.push("--cli-input-json", JSON.stringify(taskDefinition));
        const output = await execCmd(cmd);
        return JSON.parse(output).taskDefinition;
    }

    async createEcsService(cluster, taskDefinitionName, subnets, securityGroups, assignPublicIp=false) {
        subnets = Array.isArray(subnets) ? subnets.join(",") : [subnets];
        securityGroups = Array.isArray(securityGroups) ? securityGroups.join(",") : securityGroups;
        assignPublicIp = assignPublicIp === true ? ", assignPublicIp=ENABLED" : "";
        const cmd = this.getEcsCommand("create-service");
        cmd.push("--service-name", taskDefinitionName);
        cmd.push("--desired-count", 1);
        cmd.push("--launch-type", "FARGATE");
        cmd.push("--task-definition", taskDefinitionName);
        cmd.push("--network-configuration", `awsvpcConfiguration={ subnets=[${subnets}], securityGroups=[${securityGroups}]${assignPublicIp}}`);
        cmd.push("--cluster", cluster.clusterName);
        const output = await execCmd(cmd);
        return JSON.parse(output).service;
    }
    async selectCluster() {
        const ecsClusters = await this.getEcsClusters();
        if (ecsClusters.length === 0) {
            Log.error(`No ECS clusters found in region.`);
        } else if (ecsClusters.length === 1) {
            Log.info(`Only 1 active ECS cluster in region: ${Colors.italic(ecsClusters[0].clusterName)}`);
            return ecsClusters[0];
        } else {
            const clusterName = await Select.prompt({
                message: "Choose ECS Cluster",
                options: ecsClusters.map(cluster => ({name: cluster.clusterName, value: cluster.clusterName}))
            });
            return ecsClusters.find(cluster => cluster.clusterName === clusterName);
        }
    }


    async deploy() {
        await super.deploy();


        let rn = await this.selectRemoteNetwork();
        let connector = await this.selectConnector(rn);

        // Get or select ECS Cluster
        const ecsCluster = await this.selectCluster();

        // Get or select VPC
        const vpc = await this.selectVpc();

        // Get or select Subnet
        const subnet = await this.selectSubnet(vpc.VpcId);

        const securityGroups = await this.getSecurityGroups(vpc.VpcId);
        const sgName = "twingate-connector";
        const connectorSecurityGroup = securityGroups.find(sg => sg.GroupName === sgName);
        let sgId = null
        if ( connectorSecurityGroup !== undefined) {
            // TODO: Check egress
            sgId = connectorSecurityGroup.GroupId;
        }
        else {
            sgId = await this.createSecurityGroup(vpc.VpcId);
            Log.info(`Created security group: ${Colors.italic(sgName)} (${sgId})`);
        }

        const familyName = `twingate-${rn.name.replaceAll(" ", "-").replace(/[^\w-]/g, "")}`;
        const taskDefinition = await this.registerEcsTaskDefinition([connector], familyName);
        Log.info(`Created task definition: ${Colors.italic(taskDefinition.family)} (${taskDefinition.taskDefinitionArn})`);

        const assignPublicIp = [subnet].some(subnet => subnet.outboundIgw) ? true : false;
        const service = await this.createEcsService(ecsCluster, taskDefinition.family, [subnet.SubnetId], [sgId], assignPublicIp);
        Log.success(`Service created: ${Colors.italic(service.serviceName)} (${service.serviceArn})`);
        return;
    }
}