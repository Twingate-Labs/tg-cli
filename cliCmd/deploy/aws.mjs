import {TwingateApiClient} from "../../TwingateApiClient.mjs";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Select, Input, Toggle} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {execCmd, loadNetworkAndApiKey} from "../../utils/smallUtilFuncs.mjs";
import {Log} from "../../utils/log.js";
import * as Colors from "https://deno.land/std/fmt/colors.ts";

// BEGIN AWS CLI functions
function getAwsEc2Command(command, options = {}, cliOptions = {}) {
    let cmd = ["aws", "ec2", command];
    options = Object.assign({
        outputJson: true,
        noPaginate: true,
        filters: null,
        query: null,
        owners: null
    }, options);
    if ( cliOptions.profile != null ) cmd.push("--profile", cliOptions.profile);
    if ( cliOptions.region != null ) cmd.push("--region", cliOptions.region);
    if ( options.outputJson !== false ) cmd.push("--output", "json");
    if ( options.noPaginate !== false ) cmd.push("--no-paginate");
    if ( options.owners !== null ) cmd.push("--owners", options.owners);
    if ( options.filters !== null ) cmd.push("--filters", options.filters);
    if ( options.query !== null ) cmd.push("--query", options.query);
    return cmd;
}

async function getAwsCurrentRegion(cliOptions) {
    const cmd = ["aws", "configure", "get", "region"];
    if ( cliOptions.profile != null ) cmd.push("--profile", cliOptions.profile);
    const output = await execCmd(cmd);
    return output.replace(/\r?\n|\r/, "");
}

async function getAwsRegions(cliOptions) {
    const cmd = getAwsEc2Command("describe-regions", {
        filters: "Name=opt-in-status,Values=opted-in,opt-in-not-required",
        query: "Regions[].RegionName"
    }, cliOptions);
    const output = await execCmd(cmd);
    return JSON.parse(output);
}

async function getTwingateAmi(cliOptions) {
    const cmd = getAwsEc2Command("describe-images", {
        owners: 617935088040,
        filters: "Name=name,Values=twingate/images/hvm-ssd/twingate-amd64-*",
        query: "sort_by(Images, &CreationDate)[].ImageId"}, cliOptions);
    //const cmd = ["aws", "ec2", "describe-vpcs", "--output", "json", "--no-paginate", "--query", "Vpcs[*].{VpcId:VpcId,Name:Tags[?Key==`Name`].Value|[0],CidrBlock:CidrBlock,IsDefault:IsDefault}"];
    const output = await execCmd(cmd);
    let amis = JSON.parse(output);
    return amis.length > 0 ? amis[amis.length-1] : null;
}

async function getKeyPairs(cliOptions) {
    const cmd = getAwsEc2Command("describe-key-pairs", {}, cliOptions);
    const output = await execCmd(cmd);
    return JSON.parse(output).KeyPairs;
}

async function createAwsKeyPair(name, saveToFile=true, cliOptions) {
    const cmd = getAwsEc2Command("create-key-pair", {}, cliOptions);
    cmd.push("--key-name", name);
    const output = await execCmd(cmd);
    const keyPair = JSON.parse(output);
    if ( saveToFile === true ) {
        await Deno.writeTextFile(`${keyPair.KeyName}.pem`, keyPair.KeyMaterial, {mode: 0x0400});
        Log.info(`SSH key saved to file: ${Colors.italic(`${keyPair.KeyName}.pem`)}`)
    }
    return keyPair;
}

async function createAwsEc2Instance(name, imageId, userData, instanceType="t3a.micro", subnetId, keyName = null, assignPublicIp = false, cliOptions) {
     // --image-id $TWINGATE_AMI --user-data $USER_DATA --count 1 --instance-type t3a.micro --region eu-west-1 --subnet-id subnet-0d27e0733843716be --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=twingate-cunning-nyala}]'
    const cmd = getAwsEc2Command("run-instances", {}, cliOptions);
    cmd.push("--image-id", imageId);
    cmd.push("--user-data", userData);
    cmd.push("--count", 1);
    cmd.push("--instance-type", instanceType);
    cmd.push("--subnet-id", subnetId);
    if ( assignPublicIp === true) cmd.push("--associate-public-ip-address");
    if ( keyName != null ) cmd.push("--key-name", keyName);
    cmd.push("--tag-specifications", `ResourceType=instance,Tags=[{Key=Name,Value=${name}}]`);
    const output = await execCmd(cmd);
    return JSON.parse(output).Instances[0];
}

async function getVpcs(cliOptions) {
    const cmd = getAwsEc2Command("describe-vpcs", {query: "Vpcs[*].{VpcId:VpcId,Name:Tags[?Key==`Name`].Value|[0],CidrBlock:CidrBlock,IsDefault:IsDefault}"}, cliOptions);
    //const cmd = ["aws", "ec2", "describe-vpcs", "--output", "json", "--no-paginate", "--query", "Vpcs[*].{VpcId:VpcId,Name:Tags[?Key==`Name`].Value|[0],CidrBlock:CidrBlock,IsDefault:IsDefault}"];
    const output = await execCmd(cmd);
    let vpcList = JSON.parse(output);
    vpcList.map(vpc => vpc.Name = vpc.Name || "NO NAME");
    let defaultVpc = vpcList.filter(vpc => vpc.IsDefault === true);
    defaultVpc = defaultVpc.length === 0 ? null : defaultVpc[0];
    vpcList = vpcList.sort( (a,b) => (a.Name.localeCompare(b.Name)));
    return [
        vpcList,
        defaultVpc
    ];
}

async function getSubnets(vpcId, cliOptions) {
    const cmd = getAwsEc2Command("describe-subnets", {filters: `Name=vpc-id,Values=${vpcId}`}, cliOptions);
    const output = await execCmd(cmd)
    let subnetList = JSON.parse(output).Subnets
    for ( const subnet of subnetList) {
        if ( subnet.Name !== undefined ) continue;
        const subnetNameTag = subnet.Tags ? subnet.Tags.find(t => t.Key === "Name") : undefined;
        subnet.Name = subnetNameTag === undefined ? "NO NAME" : subnetNameTag.Value;
    }
    return subnetList
}


async function getRouteTables(vpcId, cliOptions) {
    const cmd = getAwsEc2Command("describe-route-tables", {filters: `Name=vpc-id,Values=${vpcId}`}, cliOptions);
    const output = await execCmd(cmd);
    let rts = JSON.parse(output).RouteTables;

    let routeTables = [];
    for (let obj of rts) {
        let isMain = obj["Associations"].filter((assoc) => {
            if (assoc.hasOwnProperty("Main")) {
                return assoc["Main"];
            }
        }).length === 1;
        let associations = obj["Associations"]
            .filter((assoc) => assoc.hasOwnProperty("SubnetId"))
            .map((assoc) => {
            return assoc["SubnetId"]
            });
        const outboundIgw = obj["Routes"].find(r => r.State === "active" && r.DestinationCidrBlock === "0.0.0.0/0" && r.GatewayId);
        const outboundNat = obj["Routes"].find(r => r.State === "active" && r.DestinationCidrBlock === "0.0.0.0/0" && r.NatGatewayId);

        let routes = obj["Routes"].filter(r => r["DestinationCidrBlock"] !== undefined).map( r => r["DestinationCidrBlock"]);
        let rt = {
            id: obj["RouteTableId"],
            main: isMain,
            associations,
            routes,
            outboundIgw,
            outboundNat
        };
        routeTables.push(rt);
    }
    return routeTables;
}

async function getSubnetsAndRoutes(vpcId, cliOptions) {
    const [subnets, routeTables] = await Promise.all([getSubnets(vpcId, cliOptions), getRouteTables(vpcId, cliOptions)]);

    for ( const subnet of subnets ) {
        subnet.outboundIgw = null;
        subnet.outboundNat = null;
        for ( const routeTable of routeTables ) {
            if  ( routeTable.associations.includes(subnet.SubnetId) ) {
                subnet.outboundIgw = routeTable.outboundIgw;
                subnet.outboundNat = routeTable.outboundNat;
                break;
            }
        }
        if ( subnet.outboundIgw == null && subnet.outboundNat == null ) {
            const mainRoute = routeTables.find(r => r.main === true);
            if ( mainRoute != null ) {
                subnet.outboundIgw = mainRoute.outboundIgw;
                subnet.outboundNat = mainRoute.outboundNat;
            }
        }
        subnet.outboundInternet = "NO INTERNET";
        if ( subnet.outboundNat ) subnet.outboundInternet = "NAT Gateway";
        else if ( subnet.outboundIgw ) subnet.outboundInternet = "Internet Gateway";
    }
    return subnets;
}


// BEGIN CLI functions
async function selectRegion(cliOptions) {
    const [defaultRegion, regions] = await Promise.all([getAwsCurrentRegion(cliOptions), getAwsRegions(cliOptions)]);
    const region = await Select.prompt({
        message: "Select region",
        options: regions.map(r => ({name: r, value: r})),
        default: defaultRegion
    });
    return region;
}

async function selectVpc(cliOptions) {
    const [vpcs, defaultVpc] = await getVpcs(cliOptions);
    const maxNameLength = Math.max(...vpcs.map(vpc => vpc.Name.length));
    const vpcId = await Select.prompt({
        message: "Choose VPC",
        options: vpcs.map(vpc => ({
            name: `${vpc.VpcId} - ${vpc.Name.padEnd(maxNameLength, " ")} - ${vpc.CidrBlock} ${vpc.IsDefault ? Colors.italic("(Default)"):""}`,
            value: vpc.VpcId
        })),
        default: defaultVpc ? defaultVpc.VpcId : undefined
    });
    return vpcs.find(vpc => vpc.VpcId === vpcId);
}

async function selectSubnet(vpcId, cliOptions) {
    const subnets = await getSubnetsAndRoutes(vpcId, cliOptions);
    if ( subnets.length === 0 ) {
        throw new Error("There are no subnets in the selected VPC.");
    }
    const maxNameLength = Math.max(...subnets.map(subnet => subnet.Name.length));
    const defaultSubnet = subnets.find(s => s.outboundNat != null ) || subnets.find(s => s.outboundIgw != null )
    if ( defaultSubnet === undefined ) throw new Error(`No subnet detected that has outbound internet access (via a 0.0.0.0/0 route) to an Internet or NAT Gateway`);
    const subnetId = await Select.prompt({
        message: "Choose subnet",
        options: subnets.map(subnet => ({
            name: `${subnet.SubnetId} - ${subnet.Name.padEnd(maxNameLength, " ")} - ${subnet.CidrBlock} - ${Colors.italic(subnet.outboundInternet)}`,
            value: subnet.SubnetId,
            disabled: subnet.outboundInternet === "NO INTERNET"
        })),
        hint: subnets.some(s => s.outboundInternet === "Internet Gateway") ? "If you select a subnet with an Internet Gateway then an Elastic Public IP will be assigned to your connector" : undefined,
        default: defaultSubnet ? defaultSubnet.SubnetId : undefined
    });
    return subnets.find(subnet => subnet.SubnetId === subnetId);
}


async function selectKeyPair(cliOptions) {
    const keyPairs = await getKeyPairs(cliOptions);

    const useKeyPair = await Select.prompt({
        message: "SSH Key Pair",
        hint: "We recommend use of an SSH key pair",
        options: [
            {name: "Use new", value: "NEW"},
            {name: "Use existing", value: "EXISTING", disabled: keyPairs.length === 0},
            {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
        ],
        default: "NEW"
    });
    if ( useKeyPair === "SKIP" ) return null;
    else if ( useKeyPair === "NEW" ) {
        const keyName = await Input.prompt({message: "Key Pair name"});
        const awsKey = await createAwsKeyPair(keyName, true, cliOptions);
        return awsKey.KeyName;
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

async function selectRemoteNetwork(cliOptions) {
    const client = cliOptions.client;
    let remoteNetworks = await client.fetchAllPages(client.getTopLevelKVQuery("RemoteNetworksKV", "remoteNetworks", "name", "id", "result", 0, "name", "id"))

    let remoteNetwork = null;
    if ( remoteNetworks.length === 0 ) {
        const remoteNetworkName = await Input.prompt({
            message: "Remote Network name",
            hint: "There are no Remote Networks in your Twingate account. Please enter a name to create one.",
        });
        remoteNetwork = await client.createRemoteNetwork(remoteNetworkName);
    }
    else {
        const remoteNetworkId = await Select.prompt({
            message: "Choose Remote Network",
            options: remoteNetworks.map(rn => ({name: rn.name, value: rn.id}))
        });
        remoteNetwork = remoteNetworks.find(remoteNetwork => remoteNetwork.id === remoteNetworkId);
    }
    return remoteNetwork;
}

async function selectConnector(remoteNetwork, cliOptions) {
    const client = cliOptions.client;
    const query = client.getRootNodePagedQuery("RemoteNetworkConnectors", "remoteNetwork", "connectors", ["id", "name", "state"]);
    let connectors = await client.fetchAllPages(query,{
        id: remoteNetwork.id,
        getResultObjFn: (response) => response.result.connectors
    });

    // Avoid redeploying existing connectors
    const hint = connectors.some(c => c.state === "ALIVE") ? `Connectors that are online are ${Colors.underline("not")} shown in this list` : null
    connectors = connectors.filter(c => c.state !== "ALIVE");
    let connector = null;
    if ( connectors.length === 0 ) {
        connector = await client.createConnector(remoteNetwork.id);
    }
    else if ( connectors.length === 1 ) {
        connector = connectors[0];
    }
    else {
        const connectorId = await Select.prompt({
            message: "Choose Connector",
            options: connectors.map(c => ({name: c.name, value: c.id})),
            hint
        });
        connector = connectors.find(connector => connector.id === connectorId);
    }

    return connector;
}

// BEGIN Commands
export const deployAwsEc2Command = new Command()
    .description("Deploy Twingate on AWS EC2")
    .action(async (options) => {
        const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
        if ( !options.region ) {
            options.region = await selectRegion(options);
        }
        else {
            Log.info(`Using AWS Region: ${options.region}`);
        }
        options.apiKey = apiKey;
        const client = new TwingateApiClient(networkName, apiKey, {logger: Log});
        options.client = client;

        let rn = await selectRemoteNetwork(options);
        let connector = await selectConnector(rn, options);

        // Lookup the AMI Id
        const ami = await getTwingateAmi(options);
        if ( ami == null ) throw new Error("Twingate AMI not found in region");

        // Get or select VPC
        const vpc = await selectVpc(options);

        // Get or select Subnet
        const subnet = await selectSubnet(vpc.VpcId, options);
        options.subnetId = subnet.SubnetId;
        // TODO: Security group

        // TODO SSH key
        const keyName = await selectKeyPair(options);
        if ( keyName != null ) options.keyName = keyName;

        // TODO: Make instance type configurable

        // TODO: Make local analytics configurable
        const logAnalytics = "v1";

        const instanceName = `twingate-${connector.name}`;
        const instanceType = "t3a.micro";
        const tokens = await client.generateConnectorTokens(connector.id);
        const assignPublicIp = subnet.outboundInternet === "Internet Gateway";
        const userData = `#!/bin/bash
            sudo mkdir -p /etc/twingate/
            HOSTNAME_LOOKUP=$(curl http://169.254.169.254/latest/meta-data/local-hostname)
            EGRESS_IP=$(curl https://checkip.amazonaws.com)
            {z
            echo TWINGATE_URL="https://${networkName}.twingate.com"
            echo TWINGATE_ACCESS_TOKEN="${tokens.accessToken}"
            echo TWINGATE_REFRESH_TOKEN="${tokens.refreshToken}"
            echo TWINGATE_LOG_ANALYTICS=${logAnalytics}
            echo TWINGATE_LABEL_HOSTNAME=$HOSTNAME_LOOKUP
            echo TWINGATE_LABEL_EGRESSIP=$EGRESS_IP
            echo TWINGATE_LABEL_DEPLOYEDBY=tgcli-aws-ec2
            } > /etc/twingate/connector.conf
            sudo systemctl enable --now twingate-connector
        `.replace(/^            /gm, "");

        let instance = await createAwsEc2Instance(instanceName, ami, userData, instanceType, options.subnetId, options.keyName, assignPublicIp, options);

        Log.success(`Created AWS EC2 Instance!\n`);
        const table = new Table();
        table.push(["Instance Id", instance.InstanceId]);
        table.push(["Private IP", instance.PrivateIpAddress]);
        table.push(["Private Hostname", instance.PrivateDnsName]);
        table.push(["Security Group", `${instance.SecurityGroups[0].GroupId} (${instance.SecurityGroups[0].GroupName})`]);
        table.render();
        Log.info(`\nPlease allow a few minutes for the instance to initialize. You should then be able to add the private IP as a resource in Twingate.`);
        Log.info(`You can do this via the Admin Console UI or via the CLI:`);
        Log.info(Colors.italic(`tg resource create "${rn.name}" "Connector host ${instanceName}" "${instance.PrivateIpAddress}"`));
        if ( options.keyName ) {
            Log.info(`Once done and authenticated to Twingate you can connect to the instance via SSH using the following command:`);
            Log.info(`${Colors.italic(`ssh -i ${options.keyName}.pem ubuntu@${instance.PrivateIpAddress}`)}`);
        }
        return;
    });


export const deployAwsCommand = new Command()
    .description("Deploy Twingate on Amazon Web Services (AWS). Required AWS CLI to be installed.")
    .globalOption(
      "-p, --profile [awsProfile:string]",
      "Named profile to use when interacting with AWS CLI.",
    )
    .command("ec2", deployAwsEc2Command);
