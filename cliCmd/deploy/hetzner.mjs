import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {HCloudDeployer} from "./deployers/hcloud/HCloudDeployer.mjs";

export const deployHCloudVmCommand = new Command()
    .description("Deploy Twingate on Hetzner Cloud (virtual machine)")
    /*
    .option("--size <string>", "Default machine size", {
        default: "s-1vcpu-2gb"
    })
    .option("--droplet-image <string>", "Default image to use (only default option is supported)", {
        default: "ubuntu-22-04-x64"
    })
     */
    .action(async (options) => (await (new HCloudDeployer(options)).deploy()));

export const deployHetznerCommand = new Command()
    .description("Deploy Twingate on Hetzner. Requires hcloud CLI to be installed.")
    /*
    .globalOption(
      "--context [context:string]",
      "Authentication context to use when interfacing with doctl CLI."
    )*/
    .command("vm", deployHCloudVmCommand)
;
