import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {LocalVmDeployer} from "./deployers/local/LocalVmDeployer.mjs";
import {LocalContainerDeployer} from "./deployers/local/LocalContainerDeployer.mjs";

export const deployLocalVmCommand = new Command()
    .description("Deploy Twingate Connector as a local Virtual Machine (requires Multipass - visit https://multipass.run)")
    .action(async (options) => await (new LocalVmDeployer(options)).deploy());

export const deployLocalContainerCommand = new Command()
    .description("Deploy Twingate Connector as a Docker Container (requires Docker - visit https://www.docker.com/)")
    .option("--dns <string>", "DNS server to use inside container", {
        default: "8.8.8.8"
    })
    .action(async (options) => await (new LocalContainerDeployer(options)).deploy());

export const deployLocalCommand = new Command()
    .description("Deploy Twingate on local machine.")
    .command("vm", deployLocalVmCommand)
    .command("container", deployLocalContainerCommand)
;
