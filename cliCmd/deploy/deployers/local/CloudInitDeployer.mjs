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
        this.cliCommand = null;
    }

    async checkAvailable() {
        return true;
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
                    deployedBy: options.deployedBy || "tgcli-cloudconfig",
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                }),
            cloudConfigFile = await Deno.makeTempFile({dir: "./", prefix: `CloudConfig-${hostname}`, suffix: ".yaml"})
        ;


        try {
            await Deno.writeTextFile(cloudConfigFile, cloudConfig.getConfig());
            Log.success(`Cloud config file saved to: ${cloudConfig}\n`);
        }
        catch (e) {
            Log.error(e);
            throw e;
        }
    }
}