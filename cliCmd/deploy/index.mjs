import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {deployAwsCommand} from "./aws.mjs";
import {deployAzCommand} from "./az.mjs";

export const deployCmd = new Command()
    .option("-y, --assume-yes [boolean]", "Automatic yes to prompts; assume 'yes' as answer to all prompts", {global: true})
    .description("Deploy Twingate to various targets")
    ;

// deployCmd.command("terraform", deployTerraformCommand);
deployCmd.command("aws", deployAwsCommand);
deployCmd.command("az", deployAzCommand);
