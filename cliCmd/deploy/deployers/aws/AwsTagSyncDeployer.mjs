import {AwsBaseDeployer} from "./AwsBaseDeployer.mjs";
import {Log} from "../../../../utils/log.js";
import {execCmd, tablifyOptions, downloadFile} from "../../../../utils/smallUtilFuncs.mjs";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import { sleep } from "https://deno.land/x/sleep/mod.ts";


export class AwsTagSyncDeployer extends AwsBaseDeployer {

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        if (!this.cliOptions.region) {
            this.cliOptions.region = await this.selectRegion();
        } else {
            Log.info(`Using AWS Region: ${this.cliOptions.region}`);
        }
        const stackName = "tg-aws-tag-sync"
        const region = this.cliOptions.region
        const s3Bucket = await this.selectS3Bucket(stackName)
        // await this.downloadRelease()
        const accountUrl = !this.cliOptions.accountName.includes("stg.opstg.com") ? `${this.cliOptions.accountName}.twingate.com`: `${this.cliOptions.accountName}`
        await this.uploadToS3Bucket(s3Bucket)
        const stackId = await this.createCloudFormation(stackName, s3Bucket, accountUrl, region)
        const stackStatus = await this.getStackStatus(stackId, stackName, region)
        console.log()


    }

    getAwsS3Command(command, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, "s3api", command];
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

    getAwsCloudFormationCommand(command, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, "cloudformation", command];
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

    async getAllS3Bucket(){
        //todo: is it possible to get bucket from a certain region? without getting the region of each bucket?
        const cmd = this.getAwsS3Command("list-buckets")
        const output = JSON.parse(await execCmd(cmd))
        return output
    }

    async createS3Bucket(bucket, region){
        const cmd = this.getAwsS3Command("create-bucket")
        cmd.push("--bucket", bucket)
        cmd.push("--create-bucket-configuration", `LocationConstraint=${region}`)
        const output = JSON.parse(await execCmd(cmd))
        console.log(`S3 Bucket ${bucket} created in region ${region}`)
        return output
    }

    async selectS3Bucket(stackName) {
        const buckets = (await this.getAllS3Bucket()).Buckets
        buckets.push({Name: `Create new S3 Bucket`})
        const fields = [
            {name: "Name"},
        ]

        const options = tablifyOptions(buckets, fields, (v) => v.Name)

        // todo: to be reviewed
        let s3Bucket = await Select.prompt({
            message: "Select S3 Bucket to store deployment package",
            options,
            default: "Create new S3 Bucket"
        })

        if (s3Bucket === "Create new S3 Bucket"){
            s3Bucket = await Input.prompt({message: "Create new S3 Bucket", default: stackName})
            await this.createS3Bucket(s3Bucket)
        }

        return s3Bucket
    }

    async downloadRelease(){
        await downloadFile("https://github.com/Twingate-Labs/tg-aws-tag-sync/releases/latest/download/CloudFormation.yaml", "CloudFormation.yaml")
        await downloadFile("https://github.com/Twingate-Labs/tg-aws-tag-sync/releases/latest/download/TgAwsTagWatchLambda.zip", "TgAwsTagWatchLambda.zip")
        Log.info("Release downloaded.")
    }

    async uploadToS3Bucket(bucket) {
        const cmd = this.getAwsS3Command("put-object")
        cmd.push("--bucket", bucket)
        cmd.push("--key", "TgAwsTagWatchLambda.zip")
        cmd.push("--body", "TgAwsTagWatchLambda.zip")
        const output = await execCmd(cmd)
    }

    async createCloudFormation(stackName,bucket, accountUrl, region) {
        const cmd = this.getAwsCloudFormationCommand("create-stack")
        cmd.push("--stack-name", stackName)
        cmd.push("--template-body", "file://CloudFormation.yaml")
        // cmd.push("--parameters", `ParameterKey=TwingateApiKey,ParameterValue=${this.cliOptions.apiKey} ParameterKey=TwingateNetworkAddress,ParameterValue=${accountUrl} ParameterKey=S3BucketName,ParameterValue=${bucket} ParameterKey=S3LambdaKey,ParameterValue=TgAwsTagWatchLambda.zip`)
        cmd.push("--parameters", `ParameterKey=TwingateApiKey,ParameterValue=${this.cliOptions.apiKey}`)
        cmd.push(`ParameterKey=TwingateNetworkAddress,ParameterValue=${accountUrl}`)
        cmd.push(`ParameterKey=S3BucketName,ParameterValue=${bucket}`)
        cmd.push(`ParameterKey=S3LambdaKey,ParameterValue=TgAwsTagWatchLambda.zip`)
        cmd.push("--capabilities", "CAPABILITY_NAMED_IAM")
        const output = JSON.parse(await execCmd(cmd))
        Log.info(`Please Wait, creating cloudformation stack ${stackName} in region ${region}.`)
        return output.StackId
    }

    async getStackStatus(stackId, stackName, region) {
        let status = "CREATE_IN_PROGRESS"
        let cmd = ""
        let output = ""
        //todo: stacks with the same name need to be handled here
        while (status === "CREATE_IN_PROGRESS") {
            await sleep(5)
            cmd = this.getAwsCloudFormationCommand("describe-stacks")
            cmd.push("--stack-name", stackName)
            output = JSON.parse(await execCmd(cmd))
            status = output.Stacks.filter(stack => stack.StackId === stackId)[0].StackStatus
        }

        if (status === "CREATE_COMPLETE") {
            Log.info(`Stack ${stackName} created in region ${region}`)
        } else {
            //todo: more error handling, e.g. remove the stack
            Log.error(`Stack ${stackName} creation failed in region ${region}, see more detail in the AWS admin console.`)
        }
    }




}