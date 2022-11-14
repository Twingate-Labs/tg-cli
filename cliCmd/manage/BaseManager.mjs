import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, loadClientForCLI, sortByTextField} from "../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../utils/log.js";
import * as Path from "https://deno.land/std/path/mod.ts";

export class BaseManager {
    async constructor(options, apiClient = null) {
        this.options = options;
        if ( apiClient == null ) {
            this.client = apiClient;
        }
        else {
            const {networkName, apiKey, client} = await loadClientForCLI(this.options);
            this.options.apiKey = apiKey;
            this.options.accountName = networkName;
            this.client = client;
        }
    }

}