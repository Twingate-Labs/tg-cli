import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, loadClientForCLI, sortByTextField} from "../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../utils/log.js";
import * as Path from "https://deno.land/std/path/mod.ts";

export class BaseDeployer {
    constructor(cliOptions) {
        this.cliOptions = cliOptions;
        this.cliCommand = null;
        this.sshKeyDir = cliOptions.sshKeyDir || ".";
    }

    async checkAvailable() {
        if (typeof this.cliCommand !== "string") {
            return null;
        }
        try {
            const [code, output, error] = await execCmd2([this.cliCommand, "--version"]);
            if (code !== 0) {
                throw new Error("CLI output returned: " + output);
            }
        } catch (e) {
            const errorMsg = `'${this.cliCommand}' CLI not detected on path. Please check that it is installed.`;
            Log.error(errorMsg);
            throw new Error(errorMsg);

        }
        return true;
    }

    async checkSshKeygenAvailable(throwError = false) {
        try {
            const [code, output, error] = await execCmd2(["ssh-keygen", "--usage"]);
            return (code === 1);
        } catch (e) {
            if (throwError) {
                const errorMsg = "ssh-keygen not detected on path. Please check that it is installed.";
                Log.error(errorMsg);
                throw new Error(errorMsg);
            }
        }
        return false;
    }

    async generateSshKey(name) {
        const filePath = Path.resolve(this.sshKeyDir, name);
        const cmd = ["ssh-keygen", "-t", "ed25519", "-C", name, "-f", filePath, "-q", "-N", ''];
        const [code, output, error] = await execCmd2(cmd, {stdout: "inherit"});
        if (code !== 0) {
            Log.error(`ssh-keygen returned: ${error}`);
        }
        return code === 0;
    }

    async selectRemoteNetwork() {
        const client = this.client;
        let remoteNetworks = await client.fetchAllPages(client.getTopLevelKVQuery("RemoteNetworksKV", "remoteNetworks", "name", "id", "result", 0, "name", "id"))

        let remoteNetwork = null;
        if (remoteNetworks.length === 0) {
            const remoteNetworkName = await Input.prompt({
                message: "Remote Network name",
                hint: "There are no Remote Networks in your Twingate account. Please enter a name to create one."
            });
            remoteNetwork = await client.createRemoteNetwork(remoteNetworkName);
        } else {
            const remoteNetworkId = await Select.prompt({
                message: "Choose Remote Network",
                options: sortByTextField(remoteNetworks, "name").map(rn => ({name: rn.name, value: rn.id})),
                search: true
            });
            remoteNetwork = remoteNetworks.find(remoteNetwork => remoteNetwork.id === remoteNetworkId);
        }
        return remoteNetwork;
    }

    async selectConnector(remoteNetwork) {
        const client = this.client;
        const query = client.getRootNodePagedQuery("RemoteNetworkConnectors", "remoteNetwork", "connectors", ["id", "name", "state"]);
        let connectors = await client.fetchAllPages(query, {
            id: remoteNetwork.id,
            getResultObjFn: (response) => response.result.connectors
        });

        // Avoid redeploying existing connectors
        const hint = connectors.some(c => c.state === "ALIVE") ? `Connectors that are online are ${Colors.underline("not")} shown in this list` : null
        connectors = connectors.filter(c => c.state !== "ALIVE");
        let connector = null;
        if (connectors.length === 0) {
            connector = await client.createConnector(remoteNetwork.id);
            Log.info(`Created new connector: ${Colors.italic(connector.name)}`)
        } else if (connectors.length === 1) {
            connector = connectors[0];
            Log.info(`Using connector: ${Colors.italic(connector.name)}`);
        } else {
            const connectorId = await Select.prompt({
                message: "Choose Connector",
                options: connectors.map(c => ({name: c.name, value: c.id})),
                hint
            });
            connector = connectors.find(connector => connector.id === connectorId);
        }

        return connector;
    }

    async deploy() {
        const {networkName, apiKey, client} = await loadClientForCLI(this.cliOptions);
        this.cliOptions.apiKey = apiKey;
        this.cliOptions.accountName = networkName;
        this.client = client;
    }
}