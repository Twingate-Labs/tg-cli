import {BaseDeployer} from "../BaseDeployer.mjs";
import {Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, formatBinary, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";

export class OracleBaseDeployer extends BaseDeployer {

    constructor(cliOptions) {
        super(cliOptions);
        this.cliCommand = "oci";
        this.imageId = cliOptions.imageId || "ocid1.image.oc1.uk-london-1.aaaaaaaapjxds2saa75y4omgjantrlufeyqxqa42ptdmeok2bj73anj6g37q";
        // oci compute image list --operating-system "Canonical Ubuntu" --operating-system-version "22.04 Minimal" --lifecycle-state AVAILABLE -c ...
        // ocid1.image.oc1.uk-london-1.aaaaaaaapjxds2saa75y4omgjantrlufeyqxqa42ptdmeok2bj73anj6g37q
    }

    getOciCommand(command, subCommand = null, options = {}) {
        const cliOptions = this.cliOptions;
        let cmd = [this.cliCommand, command];
        if ( typeof subCommand === "string" ) cmd.push(subCommand);
        else if ( Array.isArray(subCommand) ) cmd.push(...subCommand);
        if (cliOptions.tenancyId != null) {
            cmd.push("-c", cliOptions.tenancyId);
        }
        cmd.push("--request-id", "tg-cli");
        return cmd;
    }

    async getCompartments() {
        const cmd = this.getOciCommand("iam", ["compartment", "list"]);
        cmd.push("--access-level", "ACCESSIBLE");
        cmd.push("--include-root");
        const output = await execCmd(cmd);
        const compartments = JSON.parse(output);
        if ( typeof compartments !== "object") {
            Log.error("Unable to fetch compartments, check that the OCI CLI is authenticated.");
            throw new Error("Not able to get compartments");
        }
        return compartments.data;
    }

    async getVcns() {
        const cmd = this.getOciCommand("network", ["vcn", "list"]);
        cmd.push("--all");
        cmd.push("--lifecycle-state", "AVAILABLE");
        cmd.push("-c", this.compartment.id);
        const output = await execCmd(cmd);
        if ( output === "" ) throw new Error("No VCNs");
        const vcns = JSON.parse(output);
        if ( typeof vcns !== "object") {
            Log.error(`Unable to fetch Virtual Cloud Networks: ${output}`);
            throw new Error("Not able to get Virtual Cloud Networks");
        }
        return vcns.data;
    }

    async getSubnets(vcnId) {
        const cmd = this.getOciCommand("network", ["subnet", "list"]);
        cmd.push("--all");
        cmd.push("--lifecycle-state", "AVAILABLE");
        cmd.push("--vcn-id", vcnId);
        cmd.push("-c", this.compartment.id);
        const output = await execCmd(cmd);
        const subnets = JSON.parse(output);
        if ( typeof subnets !== "object") {
            Log.error(`Unable to fetch Subnets: ${output}`);
            throw new Error("Not able to get Subnets");
        }
        for ( const subnet of subnets.data ) {
            subnet.type = subnet["prohibit-internet-ingress"] ? "Private" : "Public";
        }
        return subnets.data;
    }

    async getShapes() {
        const cmd = this.getOciCommand("compute", ["shape", "list"]);
        cmd.push("--all");
        cmd.push("-c", this.compartment.id);
        if ( this.imageId ) cmd.push("--image-id", this.imageId);

        const output = await execCmd(cmd);
        const shapes = JSON.parse(output);
        if ( typeof shapes !== "object") {
            Log.error(`Unable to fetch Shapes: ${output}`);
            throw new Error("Not able to get Shapes");
        }
        return shapes.data;
    }

    async getAvailabilityDomains() {
        const cmd = this.getOciCommand("iam", ["availability-domain", "list"]);
        cmd.push("--all");
        cmd.push("-c", this.compartment.id);
        const output = await execCmd(cmd);
        const vcns = JSON.parse(output);
        if ( typeof vcns !== "object") {
            Log.error(`Unable to fetch Virtual Cloud Networks: ${output}`);
            throw new Error("Not able to get Virtual Cloud Networks");
        }
        return vcns.data;
    }

    async selectCompartment() {
        const compartments = await this.getCompartments();
        if ( compartments.length === 0 ) {
            Log.error("No compartments found");
            throw new Error("Cannot continue - no compartments");
        }
        else if ( compartments.length === 1 ) {
            Log.info(`Using compartment '${Colors.italic(compartments[0].name)}'`);
            return compartments[0];
        }
        const fields = [
            {name: "name"},
            {name: "description"}
        ]
        const defaultCompartment = compartments.find(c => c.id.indexOf("tenancy") !== -1 );
        const options = tablifyOptions(compartments, fields, (v) => v.id);
        const compartmentId = await Select.prompt({
            message: "Select Compartment",
            options,
            default: defaultCompartment.id
        });
        return compartments.find(compartment => compartment.id === compartmentId);
    }

    async selectVcn() {
        const vcns = await this.getVcns();
        if ( vcns.length === 0 ) {
            Log.error("No VCNs found");
            throw new Error("Cannot continue - no Virtual Cloud Networks");
        }
        else if ( vcns.length === 1 ) {
            Log.info(`Using VCN '${Colors.italic(vcns[0]["display-name"])}'`);
            return vcns[0];
        }
        const fields = [
            {name: "display-name"},
            {name: "vcn-domain-name"}
        ]
        const options = tablifyOptions(vcns, fields, (v) => v.id);
        const vcnId = await Select.prompt({
            message: "Select Virtual Cloud Network",
            options,
            hint: "Only available VCNs are shown"
        });
        return vcns.find(vcn => vcn.id === vcnId);
    }

    async selectSubnet(vcnId) {
        const subnets = await this.getSubnets(vcnId);
        if ( subnets.length === 0 ) {
            Log.error("No Subnets found");
            throw new Error("Cannot continue - no Subnets");
        }
        else if ( subnets.length === 1 ) {
            Log.info(`Using Subnet '${Colors.italic(subnets[0]["display-name"])}'`);
            return subnets[0];
        }
        const fields = [
            {name: "display-name"},
            {name: "subnet-domain-name"},
            {name: "type"}
        ];
        const options = tablifyOptions(subnets, fields, (v) => v.id, (v) => v.type === "Private");
        const subnetId = await Select.prompt({
            message: "Select Subnet",
            options,
            hint: "Only available Subnets are shown"
        });
        return subnets.find(subnet => subnet.id === subnetId);
    }

    async selectShape(vcnId) {
        const shapes = await this.getShapes(vcnId);
        if ( shapes.length === 0 ) {
            Log.error("No Shapes available");
            throw new Error("Cannot continue - no shapes");
        }
        else if ( shapes.length === 1 ) {
            Log.info(`Using Shape '${Colors.italic(shapes[0].shape)}'`);
            return shapes[0];
        }
        const fields = [
            {name: "shape"},
            {name: "processor-description"},
            {name: "ocpus"},
            {name: "memory-in-gbs", formatter: (v) => (formatBinary(v, "GB"))},
            {name: "networking-bandwidth-in-gbps", formatter: (v) => (formatBinary(v, "GB"))}
        ]
        const options = tablifyOptions(shapes, fields, (v) => v.shape);
        const shapeId = await Select.prompt({
            message: "Select Shape",
            options,
            hint: "Only available Shapes are shown"
        });
        return shapes.find(shape => shape.shape === shapeId);
    }


    async selectAvailabilityDomain() {
        const availabilityDomains = await this.getAvailabilityDomains();
        if ( availabilityDomains.length === 0 ) {
            Log.error("No Availability Domains found");
            throw new Error("Cannot continue - no Availability Domains");
        }
        else if ( availabilityDomains.length === 1 ) {
            Log.info(`Using VCN '${Colors.italic(availabilityDomains[0]["name"])}'`);
            return availabilityDomains[0];
        }
        const fields = [
            {name: "name"},
        ]
        const options = tablifyOptions(availabilityDomains, fields, (v) => v.id);
        const availabilityDomainId = await Select.prompt({
            message: "Select Availability Domain",
            options
        });
        return availabilityDomains.find(availabilityDomain => availabilityDomain.id === availabilityDomainId);
    }

    async deploy() {
        await super.deploy();
        await this.checkAvailable();
    }
}