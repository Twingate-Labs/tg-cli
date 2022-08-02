import {BaseDeployer} from "../BaseDeployer.mjs";
import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";

export class LocalVmDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "multipass";
    }

    async checkAvailable() {
        await super.checkAvailable();
        const cmd = [this.cliCommand, "version"];
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        if ( typeof output === "number" ) {
            Log.error(`'multipass --version' returned non-zero exit code: ${output} - please check Multipass is configured correctly.`);
        }
        return output;
    }

    getMultipassCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        return cmd;
    }

    async createVm(name, cloudInitFile) {
        const cmd = this.getMultipassCommand("launch", null);
        cmd.push("-n", name);
        cmd.push("--cloud-init", cloudInitFile);
        cmd.push("22.04");
        const [code, output, error] = await execCmd2(cmd);
        return [code, output, error];
    }

    async deploy() {
        await super.deploy();
        const
            options = this.cliOptions,
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            hostname = `tg-${connector.name}`,
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            tokens = await this.client.generateConnectorTokens(connector.id),
            cloudConfig = new ConnectorCloudInit()
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-local-vm",
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                })
                .configure(),
            cloudConfigFile = await Deno.makeTempFile({dir: "./", prefix: 'CloudConfig', suffix: ".yaml"})
        ;

        Log.info("Creating VM, please wait.");

        try {
            await Deno.writeTextFile(cloudConfigFile, cloudConfig.getConfig());
            const [code, output, error] = await this.createVm(hostname, cloudConfigFile);
            if ( code !== 0 ) throw new Error(error);
            Log.success(`Created Local VM using Multipass!\n`);
        }
        catch (e) {
            Log.error(e);
            throw e;
        }
        finally {
            await Deno.remove(cloudConfigFile);
        }
    }
}