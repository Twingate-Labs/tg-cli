import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {LocalVmDeployer} from "./deployers/local/LocalVmDeployer.mjs";
import {LocalContainerDeployer} from "./deployers/local/LocalContainerDeployer.mjs";
import {CloudInitDeployer} from "./deployers/local/CloudInitDeployer.mjs";

export const deployLocalVmCommand = new Command()
    .description("Deploy Twingate Connector as a local Virtual Machine (requires Multipass - visit https://multipass.run)")
    .action(async (options) => await (new LocalVmDeployer(options)).deploy());

export const deployLocalContainerCommand = new Command()
    .description("Deploy Twingate Connector as a Docker Container (requires Docker - visit https://www.docker.com/)")
    .option("--dns <string>", "DNS server to use inside container", {
        default: "8.8.8.8"
    })
    .action(async (options) => await (new LocalContainerDeployer(options)).deploy());

export const deployCloudInitCommand = new Command()
    .description("Output a Cloud-Init file for bootstrapping a Twingate connector - visit https://cloudinit.readthedocs.io/ for more information")
    .action(async (options) => await (new CloudInitDeployer(options)).deploy());

export const deployLocalCommand = new Command()
    .description("Deploy Twingate connector locally/on-prem.")
    .command("vm", deployLocalVmCommand)
    .command("container", deployLocalContainerCommand)
    .command("cloudinit", deployCloudInitCommand)
;
