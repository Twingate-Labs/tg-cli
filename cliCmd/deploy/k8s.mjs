import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {K8sHelmDeployer} from "./deployers/k8s/K8sHelmDeployer.mjs";

export const deployK8sHelmCommand = new Command()
    .description("Deploy Twingate on Kubernetes via Helm")
    .option("--repo <repo:string>", "Helm repo to install chart from", {
        default: "https://twingate.github.io/helm-charts"
    })
    .option("--namespace <namespace:string>", "Namespace to install into", {
        default: "twingate"
    })
    .option("--numConnectors <numConnectors:number>", "Number of connectors to deploy", {
        default: 2
    })
    .action(async (options) => await (new K8sHelmDeployer(options)).deploy());

export const deployK8sCommand = new Command()
    .description("Deploy Twingate on Kubernetes. Requires kubectl to be installed.")
    .globalOption(
      "--context [context:string]",
      "kubectl context to use."
    )
    .command("helm", deployK8sHelmCommand)
;
