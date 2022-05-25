import {genFileNameFromNetworkName, loadNetworkAndApiKey, AFFIRMATIVES, tryProcessPortRestrictionString} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {Confirm} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";

const OutputFormat = new EnumType(["text", "json"]);
OutputFormat.TEXT = "text";
OutputFormat.JSON = "json";

function countOccurrence(array, searchValue){
    return array.filter(c => c === searchValue).length
}


export const removeDuplicateResourceCmd = new Command()
    .option("-f, --file <string>", "Path to Excel file to find from", {
        required: true
    })
    // .option("-u, --users [boolean]", "Include Users")
    // .option("-n, --remote-networks [boolean]", "Include Remote Networks")
    // .option("-r, --resources [boolean]", "Include Resources")
    // .option("-g, --groups [boolean]", "Include Groups")
    .option("-s, --sync [boolean]", "Attempt to synchronise entities with the same natural identifier")
    .option("-y, --assume-yes [boolean]", "Automatic yes to prompts; assume 'yes' as answer to all prompts")
    .description("Import from excel file to a Twingate account")
    .action(async (options) => {
        const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
        options.accountName = networkName;
        let client = new TwingateApiClient(networkName, apiKey, {logger: Log});

        let fileData = null
        try {
            fileData = await Deno.readFile(options.file);
            Log.info(`Importing from file: '${Colors.italic(options.file)}'`);
        }
        catch (e) {
            Log.error(`Could not read file: ${options.file}`);
            Log.exception(e);
            return;
        }
        let wb = XLSX.read(fileData,{type:'array', cellDates: true});
        let resource_sheet = wb.Sheets["Resource"]
        let data = XLSX.utils.sheet_to_json(resource_sheet)
        let initialDict = {}
        for (let key in data) {
            let resourceId = data[key]["id"]
            let remoteNetworkLabel = data[key]["remoteNetworkLabel"]
            let addressValue = data[key]["addressValue"]
            let protocolsAllowIcmp = data[key]["protocolsAllowIcmp"]
            let protocolsTcpPolicy = data[key]["protocolsTcpPolicy"]
            let protocolsTcpPorts = data[key]["protocolsTcpPorts"]
            let protocolsUdpPolicy = data[key]["protocolsUdpPolicy"]
            let hash = `${remoteNetworkLabel}-${addressValue}-${protocolsAllowIcmp}-${protocolsTcpPolicy}-${protocolsTcpPorts}-${remoteNetworkLabel}-${protocolsUdpPolicy}`
            initialDict[resourceId] = hash
            console.log(hash)
        }
        let hashArray = Object.values(initialDict)
        let processedDict = {}
        for (let key in initialDict){
            let occurrence = countOccurrence(hashArray, initialDict[key])
            console.log(occurrence)
            if (occurrence > 1){
                if (processedDict[initialDict[key]] !== undefined){
                    processedDict[initialDict[key]].push(key)
                }
                else{
                    processedDict[initialDict[key]] = [key]
                }

            }
        }
        for (let key in processedDict){
            processedDict[key].pop()
            console.log(`connector hash: ${key}, connector ids: ${processedDict[key]}`)
        }
        let toRemove = Object.values(processedDict).flat()
        console.log("The resources above will be removed.")
        if ( options.assumeYes !== true && !(await Confirm.prompt("Please confirm to continue?")) ) return;

        for ( let x = 0; x < toRemove.length; x++ ) {
            try {
                let res = await client.removeResource(toRemove[x]);
                switch (options.outputFormat) {
                    case OutputFormat.JSON:
                        console.log(JSON.stringify(res));
                        break;
                    default:
                        Log.success(`Removed resource with id '${toRemove[x]}'.`);
                        break;
                }
            } catch (e) {
                console.error(e);
            }
        }

        let outputFilename = `remove_duplicate_resources_result-${genFileNameFromNetworkName(options.accountName)}`;



        // Log completion
        // Log.success(`Import to '${networkName}' completed. Results written to: '${outputFilename}'.`);
        return;
    });