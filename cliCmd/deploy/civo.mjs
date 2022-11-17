import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {CivoK8sHelmDeployer} from "./deployers/civo/CivoK8sHelmDeployer.mjs";

export const deployCivoK8sHelmCommand = new Command()
    .description("Deploy Twingate on Civo Kubernetes via Helm")
    .option("--repo <repo:string>", "Helm repo to install chart from", {
        default: "https://twingate.github.io/helm-charts"
    })
    .option("--namespace <namespace:string>", "Namespace to install into", {
        default: "twingate"
    })
    .option("--numConnectors <numConnectors:number>", "Number of connectors to deploy", {
        default: 2
    })
    .action(async (options) => await (new CivoK8sHelmDeployer(options)).deploy());

export const deployCivoCommand = new Command()
    .description("Deploy Twingate on Civo. Requires civo CLI to be installed.")
    .globalOption(
      "--region [region:string]",
      "civo region to use."
    )
    .command("k8s", deployCivoK8sHelmCommand)
;
