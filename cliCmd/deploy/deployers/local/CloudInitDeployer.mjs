import {BaseDeployer} from "../BaseDeployer.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";

export class CloudInitDeployer extends BaseDeployer {

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
                })
                .configure(),
            cloudConfigFile = await Deno.makeTempFile({dir: "./", prefix: `CloudConfig-${hostname}`, suffix: ".yaml"})
        ;


        try {
            await Deno.writeTextFile(cloudConfigFile, cloudConfig.getConfig());
            Log.success(`Cloud config file saved to: ${cloudConfigFile}\n`);
        }
        catch (e) {
            Log.error(e);
            throw e;
        }
    }
}