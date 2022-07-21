import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {loadClientForCLI} from "../../../utils/smallUtilFuncs.mjs";

export class BaseDeployer {
    constructor(cliOptions) {
        this.cliOptions = cliOptions;
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
                options: remoteNetworks.map(rn => ({name: rn.name, value: rn.id}))
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