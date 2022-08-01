import {BaseDeployer} from "../BaseDeployer.mjs";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";

export class LocalContainerDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = cliOptions.containerRuntime || "docker";
    }

    async checkAvailable() {
        await super.checkAvailable();
        const cmd = [this.cliCommand, "version"];
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        if ( typeof output === "number" ) {
            Log.error(`'${this.cliCommand} version' returned non-zero exit code: ${output} - please check Docker is configured correctly.`);
        }
        return output;
    }

    getDockerCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        return cmd;
    }

    async createContainer(name, accountUrl, tokens) {
        const cmd = this.getDockerCommand("run");
        cmd.push("-d");
        cmd.push("--sysctl", "net.ipv4.ping_group_range=0 2147483647");
        cmd.push("--dns", this.cliOptions.dns)
        cmd.push("--env", `TENANT_URL=${accountUrl}`);
        cmd.push("--env", `ACCESS_TOKEN=${tokens.accessToken}`);
        cmd.push("--env", `REFRESH_TOKEN=${tokens.refreshToken}`);
        cmd.push("--env", `TWINGATE_LABEL_DEPLOYEDBY=tgcli-local-container`);
        cmd.push("--name", name);
        cmd.push("--restart", "unless-stopped");
        cmd.push("--pull", "always");
        cmd.push("twingate/connector:1");
        const [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
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
            tokens = await this.client.generateConnectorTokens(connector.id)
        ;

        Log.info("Creating container, please wait.");

        try {
            const [code, output, error] = await this.createContainer(hostname, accountUrl, tokens);
            if ( code !== 0 ) throw new Error(error);
            Log.success(`Created local container!\n`);
            return 0;
        }
        catch (e) {
            Log.error(e);
            throw e;
        }
    }
}