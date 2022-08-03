import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {GcpVmDeployer} from "./deployers/gcp/GcpVmDeployer.mjs";

export const deployGcpVmCommand = new Command()
    .description("Deploy Twingate on an GCP Virtual Machine")
    .option("--machine-type <string>", "Default machine type", {
        default: "n1-standard-1"
    })
    .action(async (options) => await (new GcpVmDeployer(options)).deploy());

export const deployGcpCommand = new Command()
    .description("Deploy Twingate on Google Cloud Platform. Requires gcloud CLI to be installed.")
    .globalOption(
      "--project [project:string]",
      "Project to use when interacting with gcloud CLI."
    )
    .command("vm", deployGcpVmCommand)
;
