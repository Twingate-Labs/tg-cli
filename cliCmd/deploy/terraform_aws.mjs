import tfAwsScripts from "../../scripts/terraform/aws.json" assert { type: "json" };
import {ensureDir} from "https://deno.land/std/fs/mod.ts";

function getAwsTfVars() {
    let rtnVal = {
        aws_region: "eu-west-1",
        aws_name_prefix: "tg",
        aws_cidr_block: "10.100.0.0/16",
        aws_availability_zones: ["eu-west-1a", "eu-west-1b"],
        aws_public_subnet_cidrs: ["10.100.0.0/20","10.100.16.0/20"],
        aws_private_subnet_cidrs: ["10.100.48.0/20", "10.100.64.0/20"],
        aws_enable_dns_hostnames: true
    };
    return JSON.stringify(rtnVal);
}
function getAwsTfModule() {
    let rtnVal = `
variable "aws_name_prefix" {
  description = "A prefix used for naming resources."
  type        = string
}

variable "aws_cidr_block" {
  description = "The CIDR block for the VPC."
  type        = string
}

variable "aws_availability_zones" {
  description = "The availability zones to use for subnets and resources in the VPC. By default, all AZs in the region will be used."
  type        = list(string)
  default     = []
}

variable "aws_public_subnet_cidrs" {
  description = "A list of CIDR blocks to use for the public subnets."
  type        = list(string)
  default     = []
}

variable "aws_private_subnet_cidrs" {
  description = "A list of CIDR blocks to use for the private subnets."
  type        = list(string)
  default     = []
}

variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "aws_enable_dns_hostnames" {
  description = "A boolean flag to enable/disable DNS hostnames in the VPC."
  type        = bool
  default     = false
}

module "aws_vpc" {
  source      = "./aws"
  name_prefix = var.aws_name_prefix
  cidr_block  = var.aws_cidr_block
  availability_zones = var.aws_availability_zones
  public_subnet_cidrs = var.aws_public_subnet_cidrs
  private_subnet_cidrs = var.aws_private_subnet_cidrs
  enable_dns_hostnames = var.aws_enable_dns_hostnames
  tags = {
    terraform   = "True"
    environment = "dev"
  }
}

output "vpc_id" {
  value = module.aws_vpc.vpc_id
}
output "private_subnet_ids" {
  value = module.aws_vpc.private_subnet_ids
}`;
    return rtnVal;
}
export async function outputTerraformAws(outputDir, client, options) {
    const moduleDir = `${outputDir}/aws`;
    await ensureDir(moduleDir);
    for (const [name, content] of Object.entries(tfAwsScripts)) {
        await Deno.writeTextFile(`${moduleDir}/${name}.tf`, content);
    }
    await Deno.writeTextFile(`${outputDir}/aws.auto.tfvars.json`, getAwsTfVars());
    await Deno.writeTextFile(`${outputDir}/aws-module.tf`, getAwsTfModule());
}