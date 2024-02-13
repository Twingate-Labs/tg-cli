import {Input, Select} from "https://deno.land/x/cliffy/prompt/mod.ts";
import * as Colors from "https://deno.land/std/fmt/colors.ts";
import {execCmd, execCmd2, sortByTextField, tablifyOptions} from "../../../../utils/smallUtilFuncs.mjs";
import {Log} from "../../../../utils/log.js";
import {Table} from "https://deno.land/x/cliffy/table/mod.ts";
import {ConnectorCloudInit} from "../../ConnectorCloudInit.js";
import {OracleBaseDeployer} from "./OracleBaseDeployer.mjs";
import * as Path from "https://deno.land/std/path/mod.ts";
import { encodeBase64 } from "https://deno.land/std/encoding/base64.ts";

export class OracleVmDeployer extends OracleBaseDeployer {

    constructor(options) {
        super(options);
    }

    /*
    RETRIEVE THE HOME REGION
    oci iam region-subscription list | jq -r '.data[0]."region-name"'

    GET THE LIST OF SUBSCRIBED REGION NAMES AND KEYS
    oci iam region-subscription list | jq '.data[]."region-name" | .data[]."region-key"'
     */
    async getKeyPairs() {
        const keyNames = [];
        for await (const dirEntry of Deno.readDir(this.sshKeyDir)) {
          if ( dirEntry.isFile && dirEntry.name.endsWith(".pub") ) {
              keyNames.push({name: dirEntry.name.substring(0, dirEntry.name.length-4), path: Path.resolve(this.sshKeyDir, dirEntry.name)})
          }
        }
        sortByTextField(keyNames, "name");
        return keyNames;
    }

    async selectKeyPair() {
        const keyPairs = await this.getKeyPairs(),
              sshKeygenAvailable = await this.checkSshKeygenAvailable();

        let defaultOption = "NEW";
        if ( keyPairs.length > 0 ) defaultOption = "EXISTING";
        else if ( !sshKeygenAvailable ) defaultOption = "SKIP";

        const useKeyPair = await Select.prompt({
            message: "SSH Public Key",
            hint: "We recommend use of an SSH key pair",
            options: [
                {name: `Use new${Colors.italic( !sshKeygenAvailable ? " (ssh-keygen not available)":"")}`, value: "NEW", disabled: !sshKeygenAvailable},
                {name: `Use existing${Colors.italic(keyPairs.length === 0 ? " (none found)":"")}`, value: "EXISTING", disabled: keyPairs.length === 0},
                {name: `No, skip ${Colors.italic('(not recommended)')}`, value: "SKIP"}
            ],
            default: defaultOption
        });
        if ( useKeyPair === "SKIP" ) return null;
        else if ( useKeyPair === "NEW" ) {
            const keyName = await Input.prompt({message: "Key name", default: "tg-connector"});

            const keyCreated = await this.generateSshKey(keyName);
            if ( !keyCreated ) throw new Error("Could not create ssh key");
            const publicKey = await Deno.readTextFile(`${keyName}.pub`);
            return {name: keyName, path: Path.resolve(this.sshKeyDir, keyName)};
        }
        else {
            const keyName = await Select.prompt({
                message: "Choose Key Pair",
                options: keyPairs.map(keyPair => ({
                    name: keyPair.name,
                    value: keyPair.name
                }))
            });
            hint: `Showing files in path: ${Path.resolve(this.sshKeyDir)}`
            return keyPairs.find(keyPair => keyPair.name === keyName);
        }
    }

    async getImages(shape = null) {
        // oci compute image list --operating-system "Canonical Ubuntu" --operating-system-version "22.04 Minimal" --lifecycle-state AVAILABLE -c ocid1.tenancy.oc1..aaaaaaaaqkwzjnu3szywvun264jlk2hrveyiyd2ywsfua4ftr7535kbpsxia
        const cmd = this.getOciCommand("compute", ["image", "list"]);
        cmd.push("-c", this.compartment.id);
        cmd.push("--operating-system", "Canonical Ubuntu");
        //cmd.push("--operating-system-version", "22.04 Minimal");
        cmd.push("--lifecycle-state", "AVAILABLE");
        if ( typeof shape === "string" ) cmd.push("--shape", shape);
        const output = await execCmd(cmd);
        const images = JSON.parse(output);
        if ( typeof images !== "object") {
            Log.error(`Unable to fetch images: ${output}`);
            throw new Error("Not able to get images");
        }
        return images.data;
    }

    async selectImage(shape=null) {
        const images = await this.getImages(shape);
        if ( images.length === 0 ) {
            Log.error("No images found");
            throw new Error("Cannot continue - no images");
        }
        else if ( images.length === 1 ) {
            Log.info(`Using image '${Colors.italic(images[0]["display-name"])}'`);
            return images[0];
        }
        const fields = [
            {name: "operating-system"},
            {name: "operating-system-version"},
            {name: "display-name"}
        ]
        const options = tablifyOptions(images, fields, (v) => v.id);
        const imageId = await Select.prompt({
            message: "Select Image",
            options
        });
        return images.find(image => image.id === imageId);
    }

    async createVm(name, availabilityDomainName, shapeId, imageId, subnetId, sshKey, cloudConfig) {
        const cmd = this.getOciCommand("compute", ["instance", "launch"]);
        if ( sshKey != null ) cmd.push("--ssh-authorized-keys-file", `${sshKey.path}.pub`);
        cmd.push("-c", this.compartment.id);
        cmd.push("--shape", shapeId);
        cmd.push("--subnet-id", subnetId);
        cmd.push("--display-name", name);
        cmd.push("--hostname-label", name);
        cmd.push("--image-id", imageId);
        cmd.push("--availability-domain", availabilityDomainName);
        const metadata = {user_data: encodeBase64(cloudConfig)};
        cmd.push("--metadata", JSON.stringify(metadata));
        cmd.push("--wait-for-state", "RUNNING");
        const output = await execCmd(cmd);
        let instance = JSON.parse(output).data;
        return instance;
    }

    async getVnics(instanceId) {
        const cmd = this.getOciCommand("compute", ["instance", "list-vnics"]);
        cmd.push("--instance-id", instanceId);
        const output = await execCmd(cmd);
        let vnics = JSON.parse(output).data;
        return vnics;

    }

    async deploy() {
        await super.deploy();
        const
            options = this.cliOptions,
            remoteNetwork = await this.selectRemoteNetwork(),
            connector = await this.selectConnector(remoteNetwork),

            compartment = this.compartment = await this.selectCompartment(),
            vcn = await this.selectVcn(),
            subnet = await this.selectSubnet(vcn.id),
            shape = await this.selectShape(),
            image = await this.selectImage(shape.shape),
            sshKey = await this.selectKeyPair(),
            availabilityDomain = await this.selectAvailabilityDomain(),
            hostname = `tg-${connector.name}`,
            tokens = await this.client.generateConnectorTokens(connector.id),
            accountUrl = `https://${this.cliOptions.accountName}.twingate.com`,
            cloudConfig = new ConnectorCloudInit({
                    privateIp: `$(hostname -I)`
                })
                .setStaticConfiguration(accountUrl, tokens, {LOG_ANALYTICS: "v1"})
                .setDynamicLabels({
                    hostname,
                    deployedBy: "tgcli-oci-vm",
                    compartment: compartment["name"],
                    vcn: vcn["display-name"],
                    subnet: subnet["display-name"],
                    ad: availabilityDomain["name"],
                    egress_ip: "$(curl -s https://checkip.amazonaws.com)"
                })
                .configure({
                    sshLocalOnly: true
                })
        ;

        Log.info("Creating VM, please wait.")
        
        const
            instance = await this.createVm(hostname, availabilityDomain.name, shape.shape, image.id, subnet.id, sshKey, cloudConfig.getConfig()),
            vnics = await this.getVnics(instance.id),
            vnic = vnics[0]
        ;
        Log.success(`Created OCI VM instance!\n`);
        const table = new Table();
        table.push(["Id", instance.id])
        if ( vnic["hostname-label"] ) table.push(["Hostname", vnic["hostname-label"]]);
        if ( vnic["private-ip"] ) table.push(["Private IP", vnic["private-ip"]]);
        if ( vnic["public-ip"] ) table.push(["Public IP", vnic["public-ip"]]);
        table.render();

        Log.info(`Please allow a few minutes for the instance to initialize. You should then be able to add the private IP as a resource in Twingate.`);
        Log.info(`You can do this via the Admin Console UI or via the CLI:`);
        Log.info(Colors.italic(`tg resource create "${remoteNetwork.name}" "Connector host ${hostname}" "${vnic["private-ip"]}" Everyone`));
        Log.info(`Once done and authenticated to Twingate you can connect to the instance via SSH using the following command:`);
        if (sshKey) {
            Log.info(`${Colors.italic(`ssh -i ${sshKey.name} ubuntu@${vnic["private-ip"]}`)}`);
        }

    }
}