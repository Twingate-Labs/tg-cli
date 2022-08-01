import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {LocalVmDeployer} from "./deployers/local/LocalVmDeployer.mjs";

export const deployLocalVmCommand = new Command()
    .description("Deploy Twingate Connector as a local Virtual Machine (requires Multipass - visit https://multipass.run)")
    .action(async (options) => await (new LocalVmDeployer(options)).deploy());

export const deployLocalCommand = new Command()
    .description("Deploy Twingate on local machine.")
    .command("vm", deployLocalVmCommand)
;
