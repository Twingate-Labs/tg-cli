import jsYaml from "../../thirdParty/jsYaml/jsYaml.mjs";

export class ConnectorCloudInit {
    constructor(options) {
        this.options = options;
        this.init = {
          "apt": {
            "sources": {
              "twingate": {
                "source": "deb [trusted=true] https://packages.twingate.com/apt/ /"
              }
            }
          },
          "package_update": true,
          "package_upgrade": true,
          "packages": [
            "twingate-connector",
            "chrony"
          ],
          "write_files": [],
          "runcmd": []
        };

        this.runCommands = [
            [ "systemctl", "daemon-reload" ],
            [ "twingate_refresh_conf" ],
            [ "systemctl", "enable", "twingate-connector.service" ],
            [ "systemctl", "start", "--no-block", "twingate-connector.service" ]
        ];
        // echo "Listen Address $(ip route get 8.8.8.8 | awk '{print $7; exit}')" >> /etc/ssh/sshd_config.d/ListenLocal
        this.files = [
            {
              "content": "#!/bin/bash\nsudo touch /etc/twingate/connector.debug\nsudo systemctl restart twingate-connector\n",
              "path": "/usr/sbin/twingate_enable_debug",
              "permissions": "0755"
            },
            {
              "content": "#!/bin/bash\nsudo rm /etc/twingate/connector.debug\nsudo systemctl restart twingate-connector\n",
              "path": "/usr/sbin/twingate_disable_debug",
              "permissions": "0755"
            },
            {
              "content": "[Service]\nPermissionsStartOnly=true\nExecStartPre=/usr/sbin/twingate_refresh_conf\nEnvironmentFile=\nEnvironmentFile=/etc/twingate/connector.live\n",
              "path": "/etc/systemd/system/twingate-connector.service.d/override.conf"
            }
        ];
    }

    setStaticConfiguration(accountUrl, tokens, extraEnv={}) {
        const conf = {};
        conf["TWINGATE_URL"] = accountUrl;
        conf["TWINGATE_ACCESS_TOKEN"] = tokens.accessToken;
        conf["TWINGATE_REFRESH_TOKEN"] = tokens.refreshToken;
        for ( const [key, value] of Object.entries(extraEnv) ) {
            conf[`TWINGATE_${key}`] = value;
        }
        const content = Object.entries(conf)
            .map( ([key, value]) => `${key.toUpperCase()}=${value}`)
            .join("\n")+"\n";
        this.addFile({
            content,
            path: "/etc/twingate/connector.conf"
        });
        return this;
    }

    setDynamicLabels(labels) {
        const tgLabels = [];
        for (const [label, value] of Object.entries(labels)) {
          tgLabels.push(`export TWINGATE_LABEL_${label.toUpperCase()}=${value}`);
        }

        this.addFile({
            content: `#!/bin/bash\n# This file is called by ExecStartPre in /etc/systemd/system/twingate-connector.service.d/override.conf\necho \"# This file is generated by /usr/sbin/refresh_connector_conf. Do not edit directly." > /etc/twingate/connector.live\n${tgLabels.join("\n")}\nif [[ -f "/etc/twingate/connector.debug" ]];\nthen\n   echo "TWINGATE_LOG_LEVEL=7" >> /etc/twingate/connector.live\nfi\ncat /etc/twingate/connector.conf >> /etc/twingate/connector.live\nenv | grep "^TWINGATE_LABEL_" >> /etc/twingate/connector.live\n`,
            path: "/usr/sbin/twingate_refresh_conf",
            permissions: "0755"
        });
        return this;
    }

    configure(options = {}) {
        Object.assign(options, {
            autoUpdate: true
        }, options);

        if ( options.autoUpdate) {
            this.addFile({
                "content": "\nUnattended-Upgrade::Origins-Pattern {\n  \"site=packages.twingate.com\";\n};\n",
                "append": true,
                "path": "/etc/apt/apt.conf.d/50unattended-upgrades"
            });
        }
        return this;
    }

    addFile(fileObj) {
        this.files.push(fileObj);
    }

    getFileContent() {
        return this.files;
    }

    getRunCommands() {
        return this.runCommands;
    }

    getConfigJson() {
        return Object.assign({}, this.init, {
            write_files: this.getFileContent(),
            runcmd: this.getRunCommands()
        });
    }

    getConfig() {
        return `#cloud-config\n${jsYaml.dump(this.getConfigJson(), {lineWidth: 1000})}`
    }
}