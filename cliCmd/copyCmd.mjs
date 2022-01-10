import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {loadNetworkAndApiKey} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";


export function getCopyCommand(name) {
    return new Command()
        .arguments("<source:string> <destination:string>")
        .description(`Copy a ${name}`)
        .action(async (options, srcGroup, destGroup) => {
            let networkName = null;
            let apiKey = null;
            ({networkName, apiKey} = await loadNetworkAndApiKey(options.accountName));
            options.accountName = networkName;
            let client = new TwingateApiClient(networkName, apiKey);
            let res = await client.loadCompleteGroup(srcGroup);
            let res2 = await client.createGroup(destGroup, res.resourceIds, res.userIds);
            Log.success(`New group named '${destGroup}' created as a copy of '${srcGroup}'`);
        });
}

