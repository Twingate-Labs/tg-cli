import {resolve as resolvePath} from "https://deno.land/std/path/posix.ts";
import {ensureDir} from "https://deno.land/std/fs/mod.ts";
import {TwingateApiClient} from "../../TwingateApiClient.mjs";
import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
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
    //const allNodes = await client.fetchAll(configForTerraform);
    // Twingate Resources needs to be fetched differently
    //configForTerraform.fieldSet = [TwingateApiClient.FieldSet.ALL];
    //allNodes.Resource = (await client.fetchAllResources(configForTerraform));
    const allNodes = {
        "RemoteNetwork": [{"id": "UmVtb3RlTmV0d29yazo2NTU1", "name": "Mon Abri Ventures network"}, {
            "id": "UmVtb3RlTmV0d29yazo2OTk1",
            "name": "Home"
        }, {"id": "UmVtb3RlTmV0d29yazo3MDk1", "name": "Paperspace"}, {"id": "UmVtb3RlTmV0d29yazo4NjM2", "name": "Oracle Cloud"}, {
            "id": "UmVtb3RlTmV0d29yazo5MTIw",
            "name": "TC"
        }, {"id": "UmVtb3RlTmV0d29yazo5NDY3", "name": "WSL2"}, {"id": "UmVtb3RlTmV0d29yazo5Njkz", "name": "TestProVigil"}, {
            "id": "UmVtb3RlTmV0d29yazoxMjM4OQ==",
            "name": "bcd"
        }, {"id": "UmVtb3RlTmV0d29yazoxMzIxNw==", "name": "AWS Network P-5e28a4e"}],
        "Connector": [{
            "id": "Q29ubmVjdG9yOjMzMTM=",
            "name": "Mon Abri Ventures network-instance-3313",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo2NTU1"
        }, {"id": "Q29ubmVjdG9yOjUyMDg=", "name": "tough-flounder", "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"}, {
            "id": "Q29ubmVjdG9yOjcxMDY=",
            "name": "fanatic-hog",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }, {"id": "Q29ubmVjdG9yOjkxNzk=", "name": "unselfish-gazelle", "remoteNetworkId": "UmVtb3RlTmV0d29yazo5NDY3"}, {
            "id": "Q29ubmVjdG9yOjkxODA=",
            "name": "tactful-skua",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5NDY3"
        }, {"id": "Q29ubmVjdG9yOjk3MjQ=", "name": "moo", "remoteNetworkId": "UmVtb3RlTmV0d29yazo5MTIw"}, {
            "id": "Q29ubmVjdG9yOjk3Mjg=",
            "name": "devout-petrel",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5MTIw"
        }, {"id": "Q29ubmVjdG9yOjk3MzA=", "name": "test-connector", "remoteNetworkId": "UmVtb3RlTmV0d29yazo5Njkz"}, {
            "id": "Q29ubmVjdG9yOjk3Mzc=",
            "name": "test-connector2",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5Njkz"
        }, {"id": "Q29ubmVjdG9yOjE0MTM2", "name": "maroon-gorilla", "remoteNetworkId": "UmVtb3RlTmV0d29yazo2OTk1"}, {
            "id": "Q29ubmVjdG9yOjE4NjE3",
            "name": "cunning-nyala",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazoxMzIxNw=="
        }, {"id": "Q29ubmVjdG9yOjE5OTg4", "name": "tuscan-anaconda", "remoteNetworkId": "UmVtb3RlTmV0d29yazo2NTU1"}, {
            "id": "Q29ubmVjdG9yOjIwMDE0",
            "name": "misty-elephant",
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo2OTk1"
        }],
        "Group": [{"id": "R3JvdXA6MTE0NTk=", "name": "Everyone"}, {"id": "R3JvdXA6MTIxMTc=", "name": "2FA Test"}, {
            "id": "R3JvdXA6MTMyNTY=",
            "name": "Only Emrul"
        }, {"id": "R3JvdXA6MTYzMTc=", "name": "T1"}, {"id": "R3JvdXA6MTc4MzA=", "name": "EveryoneDemo"}],
        "Resource": [{
            "id": "UmVzb3VyY2U6MTA0NTk=",
            "name": "Test wildcard 2",
            "createdAt": "2021-06-24T16:39:10.946071+00:00",
            "updatedAt": "2021-12-05T12:03:19.648805+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "*ng.vient.dev"},
            "protocols": {
                "allowIcmp": true,
                "tcp": {"policy": "RESTRICTED", "ports": [{"start": 443, "end": 443}, {"start": 8080, "end": 8090}]},
                "udp": {"policy": "RESTRICTED", "ports": [{"start": 443, "end": 443}, {"start": 8080, "end": 8090}]}
            },
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo2NTU1"
        }, {
            "id": "UmVzb3VyY2U6MTA0Njc=",
            "name": "Test wildcard 1",
            "createdAt": "2021-06-24T16:50:36.949604+00:00",
            "updatedAt": "2021-06-24T16:50:39.181374+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "*thing.vient.dev"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo2NTU1"
        }, {
            "id": "UmVzb3VyY2U6MjQ3MDU=",
            "name": "vient-dev",
            "createdAt": "2021-07-12T17:09:58.214698+00:00",
            "updatedAt": "2021-07-12T17:19:14.282930+00:00",
            "isActive": true,
            "address": {"type": "IP", "value": "176.227.202.44/32"},
            "protocols": {
                "allowIcmp": true,
                "tcp": {"policy": "RESTRICTED", "ports": [{"start": 5000, "end": 5000}]},
                "udp": {"policy": "RESTRICTED", "ports": [{"start": 5000, "end": 5000}]}
            },
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo2NTU1"
        }, {
            "id": "UmVzb3VyY2U6MzA3NDU=",
            "name": "Connector host",
            "createdAt": "2021-07-19T18:45:25.719782+00:00",
            "updatedAt": "2022-01-26T20:00:13.081374+00:00",
            "isActive": true,
            "address": {"type": "IP", "value": "10.3.81.2"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6MzcxNjc=",
            "name": "DoesNotExist",
            "createdAt": "2021-07-27T15:29:46.023346+00:00",
            "updatedAt": "2021-07-27T15:29:50.631892+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "does_not_exist.int"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MjQ=",
            "name": "1",
            "createdAt": "2021-08-23T22:34:32.734296+00:00",
            "updatedAt": "2022-06-15T23:56:34.084199+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "1"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MjU=",
            "name": "2",
            "createdAt": "2021-08-23T22:34:44.654438+00:00",
            "updatedAt": "2021-08-23T22:34:48.393785+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "2"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MjY=",
            "name": "3",
            "createdAt": "2021-08-23T22:34:58.907518+00:00",
            "updatedAt": "2021-08-23T22:35:01.384814+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "3"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0Mjc=",
            "name": "4",
            "createdAt": "2021-08-23T22:35:06.407022+00:00",
            "updatedAt": "2021-08-23T22:35:08.834162+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "4"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0Mjg=",
            "name": "5",
            "createdAt": "2021-08-23T22:35:13.342312+00:00",
            "updatedAt": "2021-08-23T22:35:16.029260+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "5"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0Mjk=",
            "name": "6",
            "createdAt": "2021-08-23T22:35:28.588291+00:00",
            "updatedAt": "2021-08-23T22:35:30.935090+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "6"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzA=",
            "name": "7",
            "createdAt": "2021-08-23T22:35:35.016705+00:00",
            "updatedAt": "2021-08-23T22:35:36.861360+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "7"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzE=",
            "name": "8",
            "createdAt": "2021-08-23T22:35:40.641875+00:00",
            "updatedAt": "2021-08-23T22:35:42.742775+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "8"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzI=",
            "name": "9",
            "createdAt": "2021-08-23T22:35:46.281065+00:00",
            "updatedAt": "2021-08-23T22:35:48.743657+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "9"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzM=",
            "name": "10",
            "createdAt": "2021-08-23T22:35:53.295954+00:00",
            "updatedAt": "2022-06-15T23:56:36.800704+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "10"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzQ=",
            "name": "11",
            "createdAt": "2021-08-23T22:35:59.191017+00:00",
            "updatedAt": "2021-08-23T22:36:02.985089+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "11"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzU=",
            "name": "12",
            "createdAt": "2021-08-23T22:36:06.720781+00:00",
            "updatedAt": "2021-08-23T22:36:08.921389+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "12"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0MzY=",
            "name": "13",
            "createdAt": "2021-08-23T22:36:12.799627+00:00",
            "updatedAt": "2021-08-23T22:36:14.949009+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "13"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0Mzc=",
            "name": "14",
            "createdAt": "2021-08-23T22:36:20.500339+00:00",
            "updatedAt": "2021-08-23T22:36:22.892260+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "14"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0Mzg=",
            "name": "15",
            "createdAt": "2021-08-23T22:36:26.819406+00:00",
            "updatedAt": "2021-08-23T22:36:29.501623+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "15"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0Mzk=",
            "name": "16",
            "createdAt": "2021-08-23T22:36:33.439306+00:00",
            "updatedAt": "2021-08-23T22:36:35.911844+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "16"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0NDA=",
            "name": "17",
            "createdAt": "2021-08-23T22:36:40.189698+00:00",
            "updatedAt": "2021-08-23T22:36:42.509339+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "17"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0NDE=",
            "name": "18",
            "createdAt": "2021-08-23T22:36:47.152802+00:00",
            "updatedAt": "2021-08-23T22:36:48.845620+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "18"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0NDI=",
            "name": "19",
            "createdAt": "2021-08-23T22:36:53.256284+00:00",
            "updatedAt": "2021-08-23T22:36:54.942438+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "19"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6NTk0NDM=",
            "name": "20",
            "createdAt": "2021-08-23T22:36:59.202864+00:00",
            "updatedAt": "2021-08-23T22:37:01.605154+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "20"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk=", "R3JvdXA6MTc4MzA="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo3MDk1"
        }, {
            "id": "UmVzb3VyY2U6MTEyNzk5MQ==",
            "name": "Test wildcard 5",
            "createdAt": "2021-12-21T12:35:36.118046+00:00",
            "updatedAt": "2021-12-21T12:35:36.118076+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "*ng.vient.dev"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": [],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo2NTU1"
        }, {
            "id": "UmVzb3VyY2U6MTMwMTQwOQ==",
            "name": "Emruls-MacBook-Pro.local",
            "createdAt": "2022-01-29T02:03:48.693464+00:00",
            "updatedAt": "2022-01-29T02:31:40.497330+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "emruls-macBook-pro.local"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5NDY3"
        }, {
            "id": "UmVzb3VyY2U6MTMwMTYyMQ==",
            "name": "dns",
            "createdAt": "2022-01-29T02:37:24.225416+00:00",
            "updatedAt": "2022-01-29T02:37:28.424702+00:00",
            "isActive": true,
            "address": {"type": "IP", "value": "192.168.1.187"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5NDY3"
        }, {
            "id": "UmVzb3VyY2U6MTMyNjA0OA==",
            "name": "Galileo",
            "createdAt": "2022-02-01T13:08:25.286531+00:00",
            "updatedAt": "2022-02-01T13:08:31.610182+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "galileo.x.ya.c"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5NDY3"
        }, {
            "id": "UmVzb3VyY2U6MjE2NDQ0NQ==",
            "name": "oracle-mav-001",
            "createdAt": "2022-05-19T00:34:09.604962+00:00",
            "updatedAt": "2022-05-19T00:34:14.874913+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "oracle-mav-001"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }, {
            "id": "UmVzb3VyY2U6MjE4MDAzMw==",
            "name": "10.0.0.8",
            "createdAt": "2022-05-27T18:37:09.936722+00:00",
            "updatedAt": "2022-05-27T18:37:13.326387+00:00",
            "isActive": true,
            "address": {"type": "IP", "value": "10.0.0.8/32"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo5MTIw"
        }, {
            "id": "UmVzb3VyY2U6MjE4MDQ1OQ==",
            "name": "ipinfo",
            "createdAt": "2022-06-01T15:59:18.199352+00:00",
            "updatedAt": "2022-06-01T15:59:23.825278+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "ipinfo.io"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }, {
            "id": "UmVzb3VyY2U6MjE4MDkxNg==",
            "name": "Mongo DB",
            "createdAt": "2022-06-06T19:16:52.279521+00:00",
            "updatedAt": "2022-06-06T19:18:49.261466+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "*.mongodb.net"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }, {
            "id": "UmVzb3VyY2U6MjE4MzIzOA==",
            "name": "opendns",
            "createdAt": "2022-06-24T21:14:26.049979+00:00",
            "updatedAt": "2022-06-24T21:14:38.900981+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "debug.opendns.com"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }, {
            "id": "UmVzb3VyY2U6MjE4MzI0MA==",
            "name": "CF",
            "createdAt": "2022-06-24T22:02:15.176607+00:00",
            "updatedAt": "2022-06-24T22:02:18.585204+00:00",
            "isActive": true,
            "address": {"type": "IP", "value": "1.1.1.1/32"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }, {
            "id": "UmVzb3VyY2U6MjE4MzcyMA==",
            "name": "artifactory",
            "createdAt": "2022-06-29T00:41:40.113931+00:00",
            "updatedAt": "2022-06-29T00:41:43.046514+00:00",
            "isActive": true,
            "address": {"type": "DNS", "value": "tgsupport.jfrog.io"},
            "protocols": {"allowIcmp": true, "tcp": {"policy": "ALLOW_ALL", "ports": []}, "udp": {"policy": "ALLOW_ALL", "ports": []}},
            "groups": ["R3JvdXA6MTE0NTk="],
            "remoteNetworkId": "UmVtb3RlTmV0d29yazo4NjM2"
        }]
    };

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
    //return toDot(G);
    //options.outputFile = options.outputFile || genFileNameFromNetworkName(options.accountName, "json");
    //await Deno.writeTextFile(`./${options.outputFile}`, JSON.stringify(allNodes));
}


export const deployTerraformCommand = new Command()
    .description("Deploy Twingate via Terraform")
    .option("-o, --output-directory [value:string]", "Output directory")
    .option("-i, --initialize [boolean]", "Initialize Terraform")
    .action(async (options) => {
        const outputDir = resolvePath(options.outputDirectory || "terraform");
        //if (!outputDir.match(/^[^\s^\x00-\x1f\\?*:"";<>|\/.][^\x00-\x1f\\?*:"";<>|\/]*[^\s^\x00-\x1f\\?*:"";<>|\/.]+$/g)) {
        //    throw new Error(`output directory not valid: ${options.outputDirectory}`)
        //}
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
        Log.success(`Deploy to '${options.output}' completed.`);
    });