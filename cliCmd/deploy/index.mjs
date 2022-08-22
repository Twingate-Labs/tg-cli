import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {deployAwsCommand} from "./aws.mjs";
import {deployAzCommand} from "./az.mjs";
import {deployLocalCommand} from "./local.mjs";
import {deployGcpCommand} from "./gcp.mjs";
import {deployDoCommand} from "./digitalocean.mjs";
import {deployOciCommand} from "./oci.mjs";
import {deployHetznerCommand} from "./hetzner.mjs";
import {deployLinodeCommand} from "./linode.mjs";

export const deployCmd = new Command()
    .option("-y, --assume-yes [boolean]", "Automatic yes to prompts; assume 'yes' as answer to all prompts", {global: true})
    .description("Automatically deploy Twingate Connectors to various clouds and platforms")
// .command("terraform", deployTerraformCommand);
    .command("aws", deployAwsCommand)
    .command("az", deployAzCommand)
    .command("gcloud", deployGcpCommand)
    .command("oci", deployOciCommand)
    .command("do", deployDoCommand)
    .command("hetzner", deployHetznerCommand)
    .command("linode", deployLinodeCommand)
    .command("local", deployLocalCommand)
;
