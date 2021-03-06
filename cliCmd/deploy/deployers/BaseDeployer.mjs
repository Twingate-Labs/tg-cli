import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, loadClientForCLI, sortByTextField} from "../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../utils/log.js";

export class BaseDeployer {
    constructor(cliOptions) {
        this.cliOptions = cliOptions;
        this.cliCommand = null;
    }

    async checkAvailable() {
        if ( typeof this.cliCommand !== "string" ) return null;
        if (Deno.build.os === "windows") {
            // TODO
        } else {
            const output = await execCmd(["command", "-v", this.cliCommand], {returnOnNonZeroError: true});
            if (typeof output !== "string") {
                const errorMsg = `'${this.cliCommand}' CLI not detected on path. Please check that it is installed.`;
                Log.error(errorMsg);
                throw new Error(errorMsg);
            }
        }
        return true;
    }

    async checkSshKeygenAvailable(throwError=false) {
        if ( Deno.build.os === "windows" ) {
            // TODO
        }
        else {
            const output = await execCmd(["command", "-v", "ssh-keygen"], {returnOnNonZeroError: true});
            if (typeof output === "string") {
                return true;
            }
            else if (throwError) {
                const errorMsg = "ssh-keygen not detected on path. Please check that it is installed.";
                Log.error(errorMsg);
                throw new Error(errorMsg);
            }
            else {
                return false;
            }
        }
    }

    async generateSshKey(name) {
        const cmd = ["ssh-keygen", "-t", "ed25519", "-C", name, "-f", `id_ed25519_tg-${name}`, "-q", "-N", '""'];
        const output = await execCmd(cmd, {returnOnNonZeroError: true});
        return typeof output === "string";
    }

    async selectRemoteNetwork() {
        const client = this.client;
        let remoteNetworks = await client.fetchAllPages(client.getTopLevelKVQuery("RemoteNetworksKV", "remoteNetworks", "name", "id", "result", 0, "name", "id"))

        let remoteNetwork = null;
        if (remoteNetworks.length === 0) {
            const remoteNetworkName = await Input.prompt({
                message: "Remote Network name",
                hint: "There are no Remote Networks in your Twingate account. Please enter a name to create one.",
            });
            remoteNetwork = await client.createRemoteNetwork(remoteNetworkName);
        } else {
            const remoteNetworkId = await Select.prompt({
                message: "Choose Remote Network",
                options: sortByTextField(remoteNetworks, "name").map(rn => ({name: rn.name, value: rn.id}))
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