import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class AwsBaseDeployer extends BaseDeployer {

    async checkAvailable() {
        if ( Deno.build.os === "windows" ) {
            // TODO
        }
        else {
            const output = await execCmd(["command", "-v", "aws"], {returnOnNonZeroError: true});
            if (typeof output === "string") {
                return true;
            } else {
                const errorMsg = "AWS CLI not detected on path. Please check that it is installed.";
                Log.error(errorMsg);
                throw new Error(errorMsg);
            }
        }
    }

    getAwsEc2Command(command, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = ["aws", "ec2", command];
        options = Object.assign({
            outputJson: true,
            noPaginate: true,
            filters: null,
            query: null,
            owners: null
        }, options);
        if (cliOptions.profile != null) {
            cmd.push("--profile", cliOptions.profile);
        }
        if (cliOptions.region != null) {
            cmd.push("--region", cliOptions.region);
        }
        if (options.outputJson !== false) {
            cmd.push("--output", "json");
        }
        if (options.noPaginate !== false) {
            cmd.push("--no-paginate");
        }
        if (options.owners !== null) {
            cmd.push("--owners", options.owners);
        }
        if (options.filters !== null) {
            cmd.push("--filters", options.filters);
        }
        if (options.query !== null) {
            cmd.push("--query", options.query);
        }
        return cmd;
    }

    async getAwsCurrentRegion() {
        const cliOptions = this.cliOptions;
        const cmd = ["aws", "configure", "get", "region"];
        if (cliOptions.profile != null) {
            cmd.push("--profile", cliOptions.profile);
        }
        const output = await execCmd(cmd);
        return output.replace(/\r?\n|\r/, "");
    }

    async getAwsRegions() {
        const cliOptions = this.cliOptions;
        const cmd = this.getAwsEc2Command("describe-regions", {
            filters: "Name=opt-in-status,Values=opted-in,opt-in-not-required",
            query: "Regions[].RegionName"
        });
        const output = await execCmd(cmd);
        return JSON.parse(output);
    }

    async getVpcs() {
        const cliOptions = this.cliOptions;
        const cmd = this.getAwsEc2Command("describe-vpcs", {query: "Vpcs[*].{VpcId:VpcId,Name:Tags[?Key==`Name`].Value|[0],CidrBlock:CidrBlock,IsDefault:IsDefault}"});
        //const cmd = ["aws", "ec2", "describe-vpcs", "--output", "json", "--no-paginate", "--query", "Vpcs[*].{VpcId:VpcId,Name:Tags[?Key==`Name`].Value|[0],CidrBlock:CidrBlock,IsDefault:IsDefault}"];
        const output = await execCmd(cmd);
        let vpcList = JSON.parse(output);
        vpcList.map(vpc => vpc.Name = vpc.Name || "NO NAME");
        let defaultVpc = vpcList.filter(vpc => vpc.IsDefault === true);
        defaultVpc = defaultVpc.length === 0 ? null : defaultVpc[0];
        vpcList = sortByTextField(vpcList, "Name");
        return [
            vpcList,
            defaultVpc
        ];
    }


    async getSecurityGroups(vpcId) {
        const cmd = this.getAwsEc2Command("describe-security-groups", {
            filters: `Name=vpc-id,Values=${vpcId}`,
            query: "SecurityGroups"
        });
        const output = await execCmd(cmd)
        return JSON.parse(output)
    }

    async createSecurityGroup(vpcId, groupName="twingate-connector", description="Security group for Twingate connectors") {
        // aws ec2 create-security-group --group-name MySecurityGroup --description "My security group" --vpc-id vpc-1a2b3c4d
        const cmd = this.getAwsEc2Command("create-security-group")
        cmd.push("--group-name", groupName);
        cmd.push("--description", description);
        cmd.push("--vpc-id", vpcId);
        const output = await execCmd(cmd);
        return JSON.parse(output).GroupId;
    }

    async getSubnets(vpcId) {
        const cmd = this.getAwsEc2Command("describe-subnets", {filters: `Name=vpc-id,Values=${vpcId}`});
        const output = await execCmd(cmd)
        let subnetList = JSON.parse(output).Subnets
        for (const subnet of subnetList) {
            if (subnet.Name !== undefined) {
                continue;
            }
            const subnetNameTag = subnet.Tags ? subnet.Tags.find(t => t.Key === "Name") : undefined;
            subnet.Name = subnetNameTag === undefined ? "NO NAME" : subnetNameTag.Value;
        }
        return subnetList
    }

    async getRouteTables(vpcId) {
       const cmd = this.getAwsEc2Command("describe-route-tables", {filters: `Name=vpc-id,Values=${vpcId}`});
       const output = await execCmd(cmd);
       let rts = JSON.parse(output).RouteTables;

       let routeTables = [];
       for (let obj of rts) {
           let isMain = obj["Associations"].filter((assoc) => {
               if (assoc.hasOwnProperty("Main")) {
                   return assoc["Main"];
               }
           }).length === 1;
           let associations = obj["Associations"]
               .filter((assoc) => assoc.hasOwnProperty("SubnetId"))
               .map((assoc) => {
               return assoc["SubnetId"]
               });
           const outboundIgw = obj["Routes"].find(r => r.State === "active" && r.DestinationCidrBlock === "0.0.0.0/0" && r.GatewayId);
           const outboundNat = obj["Routes"].find(r => r.State === "active" && r.DestinationCidrBlock === "0.0.0.0/0" && r.NatGatewayId);

           let routes = obj["Routes"].filter(r => r["DestinationCidrBlock"] !== undefined).map( r => r["DestinationCidrBlock"]);
           let rt = {
               id: obj["RouteTableId"],
               main: isMain,
               associations,
               routes,
               outboundIgw,
               outboundNat
           };
           routeTables.push(rt);
       }
       return routeTables;
   }

    async getSubnetsAndRoutes(vpcId) {
        const [subnets, routeTables] = await Promise.all([this.getSubnets(vpcId), this.getRouteTables(vpcId)]);

        for ( const subnet of subnets ) {
            subnet.outboundIgw = null;
            subnet.outboundNat = null;
            for ( const routeTable of routeTables ) {
                if  ( routeTable.associations.includes(subnet.SubnetId) ) {
                    subnet.outboundIgw = routeTable.outboundIgw;
                    subnet.outboundNat = routeTable.outboundNat;
                    break;
                }
            }
            if (  subnet.outboundIgw == null && subnet.outboundNat == null ) {
                const mainRoute = routeTables.find(r => r.main === true);
                if ( mainRoute != null && mainRoute.associations.length === 0 ) {
                    subnet.outboundIgw = mainRoute.outboundIgw;
                    subnet.outboundNat = mainRoute.outboundNat;
                }
            }
            subnet.outboundInternet = "NO INTERNET";
            if ( subnet.outboundNat ) subnet.outboundInternet = "NAT Gateway";
            else if ( subnet.outboundIgw ) subnet.outboundInternet = "Internet Gateway";
        }
        return subnets;
    }

    async selectRegion() {
        const [defaultRegion, regions] = await Promise.all([this.getAwsCurrentRegion(), this.getAwsRegions()]);
        const region = await Select.prompt({
            message: "Select region",
            options: regions.map(r => ({name: r, value: r})),
            default: defaultRegion
        });
        return region;
    }

    async selectVpc() {
        const [vpcs, defaultVpc] = await this.getVpcs();
        const fields = [
            {name: "VpcId"},
            {name: "Name"},
            {name: "CidrBlock"},
            {name: "IsDefault", formatter: (value) => value === true ? Colors.italic("(Default)"):""}
        ]
        const options = tablifyOptions(vpcs, fields, (v) => v.VpcId);
        const vpcId = await Select.prompt({
            message: "Choose VPC",
            options: options,
            default: defaultVpc ? defaultVpc.VpcId : undefined
        });
        return vpcs.find(vpc => vpc.VpcId === vpcId);
    }

    async selectSubnet(vpcId) {
        const subnets = await this.getSubnetsAndRoutes(vpcId);
        if ( subnets.length === 0 ) {
            throw new Error("There are no subnets in the selected VPC.");
        }

        const fields = [
            {name: "SubnetId"},
            {name: "Name"},
            {name: "CidrBlock"},
            {name: "outboundInternet", formatter: (v) => Colors.italic(v)}
        ]
        const options = tablifyOptions(subnets, fields, (o) => o.SubnetId, (o) => o.outboundInternet === "NO INTERNET");

        const defaultSubnet = subnets.find(s => s.outboundNat != null ) || subnets.find(s => s.outboundIgw != null )
        if ( defaultSubnet === undefined ) throw new Error(`No subnet detected that has outbound internet access (via a 0.0.0.0/0 route) to an Internet or NAT Gateway`);
        const subnetId = await Select.prompt({
            message: "Choose subnet",
            options,
            hint: subnets.some(s => s.outboundInternet === "Internet Gateway") ? "If you select a subnet with an Internet Gateway then an Elastic Public IP will be assigned to your connector" : undefined,
            default: defaultSubnet ? defaultSubnet.SubnetId : undefined
        });
        return subnets.find(subnet => subnet.SubnetId === subnetId);
    }

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
        if (!this.cliOptions.region) {
            this.cliOptions.region = await this.selectRegion();
        } else {
            Log.info(`Using AWS Region: ${this.cliOptions.region}`);
        }
    }
}