import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {deployAwsCommand} from "./aws.mjs";
import {deployAzCommand} from "./az.mjs";
import {deployLocalCommand} from "./local.mjs";

export const deployCmd = new Command()
    .option("-y, --assume-yes [boolean]", "Automatic yes to prompts; assume 'yes' as answer to all prompts", {global: true})
    .description("Automatically deploy Twingate Connectors to various clouds and platforms")
    ;

// deployCmd.command("terraform", deployTerraformCommand);
deployCmd.command("aws", deployAwsCommand);
deployCmd.command("az", deployAzCommand);
deployCmd.command("local", deployLocalCommand);
