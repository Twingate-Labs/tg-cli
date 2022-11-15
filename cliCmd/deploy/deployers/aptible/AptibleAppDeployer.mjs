import {BaseDeployer} from "../BaseDeployer.mjs";
import {execCmd, execCmd2, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class AptibleAppDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "aptible";
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

    getAptibleCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        if ( cliOptions.environment) cmd.push("--environment", cliOptions.environment);
        return cmd;
    }

    async deployAptibleApp(name, accountUrl, tokens) {
        let cmd = this.getAptibleCommand("apps:create", name);
        Log.info(`Creating Aptible app '${name}'...`);
        let [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        if (code !== 0) throw new Error(`CLI output for 'aptible apps:create' returned non-zero status ${code}`);

        Log.info(`Setting app config...`);
        cmd = this.getAptibleCommand("config:set");
        cmd.push("--app", name);
        cmd.push(`TENANT_URL=${accountUrl}`);
        cmd.push(`ACCESS_TOKEN=${tokens.accessToken}`);
        cmd.push(`REFRESH_TOKEN=${tokens.refreshToken}`);
        cmd.push(`TWINGATE_LOG_ANALYTICS=v1`);
        cmd.push(`TWINGATE_LABEL_DEPLOYEDBY=tgcli-aptible`);
        [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        if (code !== 0) throw new Error(`CLI output for 'aptible config:set' returned non-zero status ${code}`);

        Log.info(`Deploying app...`);
        cmd = this.getAptibleCommand("deploy");
        cmd.push("--app", name);
        cmd.push("--docker-image", "twingate/connector:1");
        [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        if (code !== 0) throw new Error(`CLI output for 'aptible deploy' returned non-zero status ${code}`);

        return output;
    }

    async deploy() {
        await super.deploy();
        const
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),
            hostname = `tg-${connector.name}`,
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            tokens = await this.client.generateConnectorTokens(connector.id),
            app = await this.deployAptibleApp(hostname, accountUrl, tokens)
        ;

        Log.success(`Aptible app is now deployed. You may start adding resources via this CLI or via the Twingate Admin Panel at ${accountUrl}`);

    }
}