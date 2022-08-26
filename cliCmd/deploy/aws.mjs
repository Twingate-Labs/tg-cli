import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {AwsEc2Deployer} from "./deployers/aws/AwsEc2Deployer.mjs";
import {AwsEcsDeployer} from "./deployers/aws/AwsEcsDeployer.mjs";
import {AwsTagSyncDeployer} from "./deployers/aws/AwsTagSyncDeployer.mjs";

// BEGIN Commands
export const deployAwsEc2Command = new Command()
    .description("Deploy Twingate on AWS EC2")
    .option("-i, --instance-type <string>", "EC2 instance type to provision", {
        default: "t3a.micro"
    })
    .action(async (options) => await (new AwsEc2Deployer(options)).deploy());


export const deployAwsEcsCommand = new Command()
    .description("Deploy Twingate on AWS ECS (Fargate)")
    .action(async (options) => await (new AwsEcsDeployer(options)).deploy());

export const deployAwsTagSyncCommand = new Command()
    .description("Deploy AWS Tag Sync in AWS region")
    .action(async (options) => await (new AwsTagSyncDeployer(options)).deploy());

export const deployAwsCommand = new Command()
    .description("Deploy Twingate on Amazon Web Services (AWS). Required AWS CLI to be installed.")
    .globalOption(
      "-p, --profile [awsProfile:string]",
      "Named profile to use when interacting with AWS CLI."
    )
    .globalOption("-r, --region <string>", "AWS region to use")
    .command("ec2", deployAwsEc2Command)
    .command("ecs", deployAwsEcsCommand)
    .command("tag-sync", deployAwsTagSyncCommand)
;
