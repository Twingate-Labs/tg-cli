import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {OracleVmDeployer} from "./deployers/oci/OracleVmDeployer.mjs";

export const deployOciVmCommand = new Command()
    .description("Deploy Twingate on an OCI Virtual Machine")
    .option("--shape <string>", "Default shape", {
        default: "VM.Standard.E2.1.Micro"
    })
    .action(async (options) => await (new OracleVmDeployer(options)).deploy());

export const deployOciCommand = new Command()
    .description("Deploy Twingate on Oracle Cloud Infrastructure (OCI). Requires oci CLI to be installed.")
//    .globalOption(
//      "--project [project:string]",
//      "Project to use when interacting with gcloud CLI."
//    )
    .command("vm", deployOciVmCommand)
;
