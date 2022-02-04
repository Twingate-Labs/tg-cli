import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {loadNetworkAndApiKey} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";

export function getCreateCommand(name) {
    let cmd = null;
    switch (name) {
        case "group":
            cmd = new Command()
                .arguments("<name:string>")
                .description(`Create a ${name}`)
                .action(async (options, groupName) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.createGroup(groupName);
                    Log.success(`New ${name} named '${groupName}' created with id '${res.id}'.`);
                });
            break;

        case "network":
            cmd = new Command()
                .arguments("<name:string>")
                .description(`Create a ${name}`)
                .action(async (options, remoteNetworkName) => {
                    const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
                    options.accountName = networkName;
                    let client = new TwingateApiClient(networkName, apiKey, {logger: Log});
                    let res = await client.createRemoteNetwork(remoteNetworkName);
                    Log.success(`New ${name} named '${remoteNetworkName}' created with id '${res.id}'.`);
                });
            break;
    }
    return cmd;
}


