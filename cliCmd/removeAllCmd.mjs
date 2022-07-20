import {loadClientForCLI, loadNetworkAndApiKey} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";


const optionToNameMap = {
    groups: "Groups",
    remoteNetworks: "Remote Networks",
    resources: "Resources"
}
export const removeAllCmd = new Command()
    .description("Remove all (Groups, Resources, Remote Networks")
    .option("-n, --remote-networks", "Include Remote Networks")
    .option("-r, --resources", "Include Resources")
    .option("-g, --groups", "Include Groups")
    .hidden()
    .action(async (options) => {

        let assetNames = [];
        if ( options.groups ) assetNames.push("Groups");
        if ( options.resources ) assetNames.push("Resources");
        if ( options.remoteNetworks ) assetNames.push("Remote Networks");

        if ( assetNames.length === 0 ) {
            Log.error("Nothing to remove - please specify an option");
            return;
        }

        let assetNamesStr = "";
        for ( let x = 0; x < assetNames.length; x++ ) {
            if ( x > 0) assetNamesStr += ( x === assetNames.length-1 ? " and " : ", ");
            assetNamesStr += assetNames[x].toUpperCase();
        }

        const {networkName, apiKey, client} = await loadClientForCLI(options);
        options.apiKey = apiKey;
        options.accountName = networkName;

        Log.warn(`This action will ${Colors.red("BULK DELETE")} all ${assetNamesStr} in the account '${Colors.italic(networkName)}' and is ${Colors.red("NOT REVERSIBLE")}.`)
        if ( !(await Confirm.prompt(Colors.red(`Please confirm to continue?`))) ) return;

        if ( options.groups ) {
            let allGroups = await client.fetchAllGroups({fieldSet: [TwingateApiClient.FieldSet.ID], fieldOpts:{extraFields: ["type"]}});
            let removePromises = allGroups
                .filter( group => group.type === "MANUAL" )
                .map(group => client.removeGroup(group.id));
            await Promise.all(removePromises);
        }

        if ( options.resources ) {
            let allResources = await client.fetchAllResources({fieldSet: [TwingateApiClient.FieldSet.ID]});
            await Promise.all(allResources.map(resource => client.removeResource(resource.id)));
        }

        if ( options.remoteNetworks ) {
            let allRemoteNetworks = await client.fetchAllRemoteNetworks({fieldSet: [TwingateApiClient.FieldSet.ID]});
            await Promise.all(allRemoteNetworks.map(remoteNetwork => client.removeRemoteNetwork(remoteNetwork.id)));
        }

        Log.success(`Remove all completed.`);
    });