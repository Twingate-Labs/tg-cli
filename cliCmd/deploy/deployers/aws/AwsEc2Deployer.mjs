import {execCmd} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {AwsBaseDeployer} from "./AwsBaseDeployer.mjs";

export class AwsEc2Deployer extends AwsBaseDeployer {

    async getTwingateAmi() {
        const cmd = this.getAwsEc2Command("describe-images", {
            owners: 617935088040,
            filters: "Name=name,Values=twingate/images/hvm-ssd/twingate-amd64-*",
            query: "sort_by(Images, &CreationDate)[].ImageId"
        });
        //const cmd = ["aws", "ec2", "describe-vpcs", "--output", "json", "--no-paginate", "--query", "Vpcs[*].{VpcId:VpcId,Name:Tags[?Key==`Name`].Value|[0],CidrBlock:CidrBlock,IsDefault:IsDefault}"];
        const output = await execCmd(cmd);
        let amis = JSON.parse(output);
        return amis.length > 0 ? amis[amis.length - 1] : null;
    }

    async getKeyPairs() {
        const cmd = this.getAwsEc2Command("describe-key-pairs");
        const output = await execCmd(cmd);
        return JSON.parse(output).KeyPairs;
    }

    async createAwsKeyPair(name, saveToFile = true) {
        const cmd = this.getAwsEc2Command("create-key-pair");
        cmd.push("--key-name", name);
        const output = await execCmd(cmd);
        const keyPair = JSON.parse(output);
        if (saveToFile === true) {
            await Deno.writeTextFile(`${keyPair.KeyName}.pem`, keyPair.KeyMaterial, {mode: 0x0400});
            Log.info(`SSH key saved to file: ${Colors.italic(`${keyPair.KeyName}.pem`)}`)
        }
        return keyPair;
    }

    async createAwsEc2Instance(name, imageId, userData, instanceType="t3a.micro", subnetId, keyName = null, assignPublicIp = false) {
         // --image-id $TWINGATE_AMI --user-data $USER_DATA --count 1 --instance-type t3a.micro --region eu-west-1 --subnet-id subnet-0d27e0733843716be --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=twingate-cunning-nyala}]'
        const cmd = this.getAwsEc2Command("run-instances");
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

    async selectKeyPair() {
        const keyPairs = await this.getKeyPairs();

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
            const awsKey = await this.createAwsKeyPair(keyName, true);
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

    async deploy() {
        await super.deploy();

        // Lookup the AMI Id
        this.ami = await this.getTwingateAmi();
        if (this.ami == null) {
            throw new Error("Twingate AMI not found in region");
        }

        const options = this.cliOptions;

        let rn = await this.selectRemoteNetwork();
        let connector = await this.selectConnector(rn);

        // Get or select VPC
        const vpc = await this.selectVpc();

        // Get or select Subnet
        const subnet = await this.selectSubnet(vpc.VpcId);
        options.subnetId = subnet.SubnetId;

        // TODO: Security group

        // Select SSH key
        const keyName = await this.selectKeyPair();
        if (keyName != null) {
            options.keyName = keyName;
        }

        // TODO: Make local analytics configurable
        const logAnalytics = "v1";

        const instanceName = `twingate-${connector.name}`;
        const instanceType = options.instanceType || "t3a.micro";
        const tokens = await this.client.generateConnectorTokens(connector.id);
        const assignPublicIp = subnet.outboundInternet === "Internet Gateway";
        const userData = `#!/bin/bash
            sudo mkdir -p /etc/twingate/
            HOSTNAME_LOOKUP=$(curl http://169.254.169.254/latest/meta-data/local-hostname)
            EGRESS_IP=$(curl https://checkip.amazonaws.com)
            {
            echo TWINGATE_URL="https://${this.cliOptions.accountName}.twingate.com"
            echo TWINGATE_ACCESS_TOKEN="${tokens.accessToken}"
            echo TWINGATE_REFRESH_TOKEN="${tokens.refreshToken}"
            echo TWINGATE_LOG_ANALYTICS=${logAnalytics}
            echo TWINGATE_LABEL_HOSTNAME=$HOSTNAME_LOOKUP
            echo TWINGATE_LABEL_EGRESSIP=$EGRESS_IP
            echo TWINGATE_LABEL_DEPLOYEDBY=tgcli-aws-ec2
            } > /etc/twingate/connector.conf
            sudo systemctl enable --now twingate-connector
        `.replace(/^            /gm, "");

        let instance = await this.createAwsEc2Instance(instanceName, this.ami, userData, instanceType, options.subnetId, options.keyName, assignPublicIp);

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
        if (options.keyName) {
            Log.info(`Once done and authenticated to Twingate you can connect to the instance via SSH using the following command:`);
            Log.info(`${Colors.italic(`ssh -i ${options.keyName}.pem ubuntu@${instance.PrivateIpAddress}`)}`);
        }
    }
}