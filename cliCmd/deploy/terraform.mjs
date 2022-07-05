import {resolve as resolvePath} from "https://deno.land/std/path/posix.ts";
import {ensureDir} from "https://deno.land/std/fs/mod.ts";
import {TwingateApiClient} from "../../TwingateApiClient.mjs";
import {Command} from "https://deno.land/x/cliffy/command/mod.ts";
import {loadNetworkAndApiKey} from "../../utils/smallUtilFuncs.mjs";
import {Log} from "../../utils/log.js";

function getTwingateTfVars(networkName, apiKey, extraVars={}) {
    let rtnVal = Object.assign({
        twingate_network_name: networkName,
        twingate_api_key: apiKey
    }, extraVars);
    return JSON.stringify(rtnVal);
}

function getTwingateTfModule() {
    const s = `
    variable "twingate_network_name" {
      type = string
      sensitive = true
    }
    variable "twingate_api_key" {
      type = string
      sensitive = true
    }

    
    module "twingate" {
      source = "./twingate"
      network_name = var.twingate_network_name
      api_key = var.twingate_api_key
    }`.replace(/^    /gm, "");
    return s;
}

function getTwingateTfProvider() {
    const s = `
    terraform {
      required_providers {
        twingate = {
          source = "Twingate/twingate"
          version = ">= 0.1.8"
        }
      }
    }
    
    variable "network_name" {
      type = string
      sensitive = true
    }
    variable "api_key" {
      type = string
      sensitive = true
    }
    
    provider "twingate" {
      api_token = var.api_key
      network   = var.network_name
    }`.replace(/^    /gm, "");

    return s;
}

async function generateTwingateTerraform(client, options) {

    const configForTerraform = {
        typesToFetch: ["RemoteNetwork", "Connector", "Group"],
        fieldSet: [TwingateApiClient.FieldSet.ID, TwingateApiClient.FieldSet.LABEL,
                   TwingateApiClient.FieldSet.NODES],
        recordTransformOpts: {
            mapNodeToId: true
        }
    }
    const allNodes = await client.fetchAll(configForTerraform);
    // Twingate Resources needs to be fetched differently
    configForTerraform.fieldSet = [TwingateApiClient.FieldSet.ALL];
    allNodes.Resource = (await client.fetchAllResources(configForTerraform));

    const tfImports = [];
    let idMap = {};
    const tfIdMapper = (n) => {
        n.tfId = n.name.replace(/[\s+\.+]/g, "-");
        if ( n.tfId.match(/^[0-9].*/) ) {
            n.tfId = `_${n.tfId}`;
        }
        idMap[n.id] = n.tfId
    }
    allNodes.RemoteNetwork.forEach(tfIdMapper);
    allNodes.RemoteNetwork.forEach(n => tfImports.push(`terraform import module.twingate.twingate_remote_network.${n.tfId} ${n.id}`));

    allNodes.Connector.forEach(tfIdMapper);
    allNodes.Connector.forEach(n => tfImports.push(`terraform import module.twingate.twingate_connector.${n.tfId} ${n.id}`));
    allNodes.Group.forEach(tfIdMapper);
    allNodes.Group.forEach(n => tfImports.push(`terraform import module.twingate.twingate_group.${n.tfId} ${n.id}`));

    allNodes.Resource.forEach(tfIdMapper);
    allNodes.Resource.forEach(n => tfImports.push(`terraform import module.twingate.twingate_resource.${n.tfId} ${n.id}`));

    const remoteNetworksTf = "\n#\n# Twingate Remote Networks\n#\n" + allNodes.RemoteNetwork.map(n => `
        resource "twingate_remote_network" "${n.tfId}" { # Id: ${n.id}
          name = "${n.name}"
        }`.replace(/^        /gm, "")).join("\n");

    const connectorsTf = "\n#\n# Twingate Connectors\n#\n" + allNodes.Connector.map(n => `
        resource "twingate_connector" "${n.tfId}" { # Id: ${n.id}
          name = "${n.name}"
          remote_network_id = twingate_remote_network.${idMap[n.remoteNetworkId]}.id
        }`.replace(/^        /gm, "")).join("\n");

    const groupsTf = "\n#\n# Twingate Groups\n#\n" + allNodes.Group.map(n => `
        resource "twingate_group" "${n.tfId}" { # Id: ${n.id}
          name = "${n.name}"
        }`.replace(/^        /gm, "")).join("\n");

    const resourcesTf = "\n#\n# Twingate Resources\n#\n" + allNodes.Resource.map(n => `
        resource "twingate_resource" "${n.tfId}" { # Id: ${n.id}
          name = "${n.name}"
          address = "${n.address.value}"
          remote_network_id = twingate_remote_network.${idMap[n.remoteNetworkId]}.id
          group_ids = [${n.groups.map(groupId => `twingate_group.${idMap[groupId]}.id`).join(", ")}]
          protocols {
            allow_icmp = ${n.protocols.allowIcmp}
            tcp {
                policy = "${n.protocols.tcp.policy}"
                ports = [${n.protocols.tcp.ports.map(port => port.start === port.end ? `"${port.start}"` : `"${port.start}-${port.end}"`).join(", ")}]
            }
            udp {
                policy = "${n.protocols.udp.policy}"
                ports = [${n.protocols.udp.ports.map(port => port.start === port.end ? `"${port.start}"` : `"${port.start}-${port.end}"`).join(", ")}]
            }
          }
        }`.replace(/^        /gm, "")).join("\n");


    const tfContent = `${remoteNetworksTf}\n\n${connectorsTf}\n\n${groupsTf}\n\n${resourcesTf}`;
    return {tfContent, tfImports};
}


export const deployTerraformCommand = new Command()
    .description("Deploy Twingate via Terraform")
    .option("-o, --output-directory [value:string]", "Output directory")
    .option("-i, --initialize [boolean]", "Initialize Terraform")
    .action(async (options) => {
        const outputDir = resolvePath(options.outputDirectory || "terraform");
        await ensureDir(outputDir);
        let moduleDir = `${outputDir}/twingate`;
        await ensureDir(moduleDir);

        const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
        options.apiKey = apiKey;
        const client = new TwingateApiClient(networkName, apiKey, {logger: Log});
        const {tfContent, tfImports} = await generateTwingateTerraform(client, options);

        await Deno.writeTextFile(`${outputDir}/twingate-module.tf`, getTwingateTfModule());
        await Deno.writeTextFile(`${outputDir}/twingate.auto.tfvars.json`, getTwingateTfVars(networkName, apiKey));
        await Deno.writeTextFile(`${moduleDir}/twingate-provider.tf`, getTwingateTfProvider());
        await Deno.writeTextFile(`${moduleDir}/twingate.tf`, tfContent);

        if ( Deno.build.os === "windows") {
            await Deno.writeTextFile(`${outputDir}/import-twingate.bat`, tfImports.join("\r\n"));
        }
        else {
            await Deno.writeTextFile(`${outputDir}/import-twingate.sh`, "#!/bin/sh\n"+tfImports.join("\n"), {mode: 0o755});
        }
        Log.success(`Deploy to '${outputDir}' completed.`);
    });