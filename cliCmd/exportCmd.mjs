import {genFileNameFromNetworkName, loadNetworkAndApiKey, setLastConnectedOnUser} from "../utils/smallUtilFuncs.mjs";
import {TwingateApiClient} from "../TwingateApiClient.mjs";
import {Log} from "../utils/log.js";
import XLSX from "https://cdn.esm.sh/v58/xlsx@0.17.4/deno/xlsx.js";
import {Command, EnumType} from "https://deno.land/x/cliffy/command/mod.ts";
import {
    attribute,
    digraph,
    renderDot,
    toDot
} from "https://x.nest.land/graphviz@0.3.0/mod.ts";

async function outputDot(client, options) {

    const configForGraph = {
        typesToFetch: ["User", "Group", "Resource", "RemoteNetwork"],
        fieldSet: [TwingateApiClient.FieldSet.ID, TwingateApiClient.FieldSet.LABEL,
            TwingateApiClient.FieldSet.NODES, TwingateApiClient.FieldSet.CONNECTIONS],
        recordTransformOpts: {
            mapNodeToId: true
        }
    }
    const allNodes = await client.fetchAll(configForGraph);

    let nodeCache = {};

    const graphConfig = {
        "User": {
            "nodeAttrs": {
                [attribute.fillcolor]: "#ECECEC"
            }
        },
        "Group": {
            "connectionFields": ["users"],
            "skipConnectionFn": (connectionField, record) => record.name === "Everyone" && connectionField === "users",
            "skipNodeFn": ((group) => group.resources.length === 0),
            "nodeAttrs": (record, _ ) => ({
                [attribute.fillcolor]: record.name === "Everyone"? "#ff0000" : "#0415A6",
                [attribute.fontcolor]: "#ffffff"
            })
        },
        "Resource": {
            //"nodeFields": ["remoteNetwork"],
            "connectionFields": ["groups"],
            "nodeAttrs": (record, _ ) => ({
                [attribute.fillcolor]: "#ffffff",
                [attribute.color]: "#000000",
                [attribute.fontcolor]: "#000000"
            })
        },
        "RemoteNetwork": {
            "connectionFields": ["resources"],
            "nodeAttrs": {
                [attribute.fillcolor]: "#000000",
                [attribute.fontcolor]: "#ffffff"
            }
        }
    }
    const G = digraph("G", (g) => {
        g.set("rankdir", "LR");

        g.node({
            [attribute.border]: 2,
            [attribute.shape]: "Mrecord",
            [attribute.style]: "filled",
            [attribute.color]: "#ffffff",
            [attribute.fontname]: "Sans-Serif"
        });
        g.edge({
            [attribute.arrowhead]: "none",
            [attribute.penwidth]: 2,
            [attribute.color]: "#000000CC",
            [attribute.style]: "tapered"
        });

        for (const [typeName, records] of Object.entries(allNodes)) {
            graphConfig[typeName] = graphConfig[typeName] || {};
            graphConfig[typeName].subgraph = g.subgraph(typeName, (typeGraph) => {
                let typeDef = TwingateApiClient.Schema[typeName];
                let typeGraphConfig = graphConfig[typeName];
                typeGraphConfig = typeGraphConfig || {};
                typeGraphConfig.skipNodeFn = typeGraphConfig.skipNodeFn || ((_) => false);
                for (const record of records) {
                    if (typeGraphConfig.skipNodeFn(record)) continue;
                    let attrs = Object.assign({}, {
                        [attribute.label]: record[typeDef.labelField],
                        typeName
                    }, typeof typeGraphConfig.nodeAttrs == "function" ? typeGraphConfig.nodeAttrs(record, typeName): typeGraphConfig.nodeAttrs) ;

                    nodeCache[record.id] = typeGraph.node(record.id, attrs);
                }
            });
        }

        let nodeIds = new Set(Object.keys(nodeCache));
        g._edge = g.edge;
        g.edge = (edges) => {
            nodeIds.delete(edges[0].id);
            nodeIds.delete(edges[1].id);
            return g._edge(edges);
        }

        for (const [typeName, records] of Object.entries(allNodes)) {
            let typeDef = TwingateApiClient.Schema[typeName];
            let typeGraphConfig = graphConfig[typeName];
            typeGraphConfig = typeGraphConfig || {};
            typeGraphConfig.nodeFields = typeGraphConfig.nodeFields || [];
            typeGraphConfig.connectionFields = typeGraphConfig.connectionFields || [];
            typeGraphConfig.skipConnectionFn = typeGraphConfig.skipConnectionFn || (() => false);

            for (const record of records) {
                let fromNode = nodeCache[record.id];
                if (!fromNode) continue;
                for (const connectionField of typeGraphConfig.connectionFields) {
                    if (typeGraphConfig.skipConnectionFn(connectionField, record)) continue;
                    for (const connection of record[connectionField]) {
                        let toNode = nodeCache[connection];
                        if (toNode) g.edge([fromNode, toNode]);
                    }
                }
                for (const nodeField of typeGraphConfig.nodeFields) {
                    let toNode = nodeCache[record[`${nodeField}Id`]];
                    if (fromNode && toNode) g.edge([fromNode, toNode]);
                }
            }
        }

        // Remove unlinked nodes
        for (let nodeIdToRemove of nodeIds) {
            let node = nodeCache[nodeIdToRemove];
            graphConfig[node.attributes.get("typeName")].subgraph.removeNode(node);
        }
    });

    return toDot(G);
}

async function exportDot(client, options) {
    let dot = await outputDot(client, options);
    options.outputFile = options.outputFile || genFileNameFromNetworkName(options.accountName, options.format);
    return await Deno.writeTextFile(`./${options.outputFile}`, dot);
}


async function exportImage(client, options) {
    let dot = await outputDot(client, options);
    options.outputFile = options.outputFile || genFileNameFromNetworkName(options.accountName, options.format);
    return await renderDot(dot, `./${options.outputFile}`, {format: options.format});
}

async function exportExcel(client, options) {
    const configForExport = {
        defaultConnectionFields: "LABEL_FIELD",
        fieldOpts: {
            defaultObjectFieldSet: [TwingateApiClient.FieldSet.LABEL]
        },
        joinConnectionFields: ", ",
        recordTransformOpts: {
            mapDateFields: true,
            mapNodeToLabel: true,
            mapEnumToDisplay: true,
            flattenObjectFields: true
        }
    }
    const allNodes = await client.fetchAll(configForExport);

    setLastConnectedOnUser(allNodes);
    let wb = XLSX.utils.book_new();
    for (const [typeName, records] of Object.entries(allNodes)) {
        //if ( typeName !== "RemoteNetwork") continue;
        let ws = XLSX.utils.json_to_sheet(records);
        ws['!autofilter'] = {ref: ws["!ref"]};
        XLSX.utils.book_append_sheet(wb, ws, typeName);
    }
    options.outputFile = options.outputFile || genFileNameFromNetworkName(options.accountName);
    await Deno.writeFile(`./${options.outputFile}`, new Uint8Array(XLSX.write(wb, {type: "array"})));
}


const outputFnMap = {
    "xlsx": exportExcel,
    "dot": exportDot,
    "png": exportImage,
    "svg": exportImage
};

export const exportCmd = new Command()
    .type("exportFormat", new EnumType(Object.keys(outputFnMap)))
    .option("-f, --format [value:exportFormat]", "Export format", {default: "xlsx"})
    .option("-o, --output-file [value:string]", "Output filename")
    .description("Export from account to various formats")
    .action(async (options) => {
        const {networkName, apiKey} = await loadNetworkAndApiKey(options.accountName);
        options.accountName = networkName;
        let client = new TwingateApiClient(networkName, apiKey);
        let outputFn = outputFnMap[options.format];
        if (outputFn == null) {
            Log.error(`Unsupported option: '${options.format}'`);
            return;
        }
        await outputFn(client, options);
        Log.success(`Export to '${options.outputFile}' completed.`);
    });