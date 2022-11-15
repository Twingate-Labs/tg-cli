import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {AptibleAppDeployer} from "./deployers/aptible/AptibleAppDeployer.mjs";


export const deployAptibleAppCommand = new Command()
    .description("Deploy Twingate Connector as an Aptible app (requires Aptible CLI - visit https://deploy-docs.aptible.com/docs/cli for more information)")
    .option("--environment <string>", "Aptible environment to use", {
    })
    .action(async (options) => await (new AptibleAppDeployer(options)).deploy());

export const deployAptibleCommand = new Command()
    .description("Deploy Twingate connector on Aptible.com.")
    .command("app", deployAptibleAppCommand)
;
