import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {AzureVmDeployer} from "./deployers/azure/AzureVmDeployer.mjs";

export const deployAzVmCommand = new Command()
    .description("Deploy Twingate on an Azure Virtual Machine")
    .option("-s, --size <string>", "Instance size to provision", {
        default: "Standard_B1ms"
    })
    .action(async (options) => await (new AzureVmDeployer(options)).deploy());

export const deployAzCommand = new Command()
    .description("Deploy Twingate on Microsoft Azure. Requires Azure CLI to be installed.")
    .globalOption(
      "-s, --subscription [azSubscription:string]",
      "Subscription to use when interacting with Azure CLI."
    )
    .command("vm", deployAzVmCommand)
;
