import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {LinodeVmDeployer} from "./deployers/linode/LinodeVmDeployer.mjs";

// BEGIN Commands
export const deployLinodeVMommand = new Command()
    .description("Deploy Twingate on Linode VM")
    .option("--type <string>", "Default machine size", {
        default: "g6-dedicated-2"
    })
    .option("--image <string>", "Default image to use (only default option is supported)", {
        default: "linode/ubuntu22.04"
    })
    .action(async (options) => await (new LinodeVmDeployer(options)).deploy());

export const deployLinodeCommand = new Command()
    .description("Deploy Twingate on Linode. Required Linode CLI to be installed.")
    .command("vm", deployLinodeVMommand)
;
