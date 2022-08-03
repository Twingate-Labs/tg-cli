import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {DigitalOceanDeployer} from "./deployers/digitalocean/DigitalOceanDeployer.mjs";

export const deployDoVmCommand = new Command()
    .description("Deploy Twingate on DigitalOcean as a Droplet (virtual machine)")
    .option("--size <string>", "Default machine size", {
        default: "s-1vcpu-2gb"
    })
    .action(async (options) => await (new DigitalOceanDeployer(options)).deploy());

export const deployDoCommand = new Command()
    .description("Deploy Twingate on DigitalOcean. Requires doctl CLI to be installed.")
    .globalOption(
      "--context [context:string]",
      "Authentication context to use when interfacing with doctl CLI."
    )
    .command("vm", deployDoVmCommand)
;
