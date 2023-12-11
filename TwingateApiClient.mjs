const _capitalise = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
const delay = async (ms) => new Promise(resolve => setTimeout(resolve, ms));


/**
 * Twingate GraphQL API Client
 */
export class TwingateApiClient {
    static VERSION = "0.1.0";

    static FieldSet = {
        ID: "ID",
        LABEL: "LABEL",
        CONNECTIONS: "CONNECTIONS",
        NODES: "NODES",
        ALL: "ALL"
    }

    static IdPrefixes = {
        // Really not ideal since identifiers are meant to be opaque
        RemoteNetwork: "UmVtb3RlTmV0d29yazo",// btoa("RemoteNetwork:").replace(/=$/, ""),
        Group: "R3JvdXA6", // btoa("Group:").replace(/=$/, "")
        Resource: "UmVzb3Vy",
        User: "VXNlcjo",
        SecurityPolicy: "U2VjdXJp",
        Device: "RGV2aWNlO"
    }

    static Schema = {
        // BEGIN types
        "ResourceAddress": {
            isNode: false,
            fields: [
                {name: "type", type: "enum", typeName: "AddressType", valueMap: {"IP":"IP", "DNS":"DNS"}},
                {name: "value", type: "string"}
            ]
        },
        "ResourceProtocols": {
            isNode: false,
            fields: [
                {name: "allowIcmp", type: "boolean"},
                {name: "tcp", type: "Object", typeName: "ResourceProtocol"},
                {name: "udp", type: "Object", typeName: "ResourceProtocol"}
            ]
        },
        "ResourceProtocol": {
            isNode: false,
            fields: [
                {name: "policy", type: "enum", typeName: "ProtocolPolicy", valueMap: {"ALLOW_ALL":"Allow All", "RESTRICTED":"Restricted"} },
                {name: "ports", type: "Object", multiple: true, typeName: "PortRange",
                    flattenStatementsFn: (path, fieldDef) => [`obj["${path.map( (e, i) => i === 0 ? e : _capitalise(e) ).join("")}"] = obj.${path.join(".")}.map(port => (port.start === port.end ? port.start : \`\${port.start}-\${port.end}\`)).join(", ");`]
                }
            ]
        },
        "PortRange": {
            isNode: false,
            fields: [
                {name: "start", type: "integer"},
                {name: "end", type: "integer"}
            ]
        },
        "Key": {
            isNode: false,
            fields: [
                {name: "totalCount", type: "integer"},
            ]
        },

        // END types
        // BEGIN nodes
        "User": {
            isNode: true,
            fields: [
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "firstName", type: "string"},
                {name: "lastName", type: "string"},
                {name: "email", type: "string", isLabel: true},
                {name: "avatarUrl", type: "string"},
                {name: "isAdmin", type: "boolean"},
                {name: "state", type: "enum", typeName: "UserState", valueMap: {"PENDING": "Pending", "ACTIVE": "Active", "DISABLED": "Disabled"}},
                {name: "groups", type: "Connection", typeName: "Group"}
            ]
        },
        "Group": {
            isNode: true,
            canCreate: true,
            fields: [
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "name", type: "string", isLabel: true},
                {name: "isActive", type: "boolean"},
                {name: "type", type: "enum", typeName: "GroupType", valueMap: {"MANUAL": "Manual", "SYNCED": "Synced", "SYSTEM": "System"}},
                {name: "users", type: "Connection", typeName: "User"},
                {name: "resources", type: "Connection", typeName: "Resource"}
            ]
        },
        "Resource": {
            isNode: true,
            canCreate: true,
            fields: [
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "name", type: "string", isLabel: true, canQuery: true},
                {name: "address", type: "Object", typeName: "ResourceAddress"},
                {name: "alias", type: "string"},
                {name: "protocols", type: "Object", typeName: "ResourceProtocols"},
                {name: "isActive", type: "boolean"},
                {name: "remoteNetwork", type: "Node", typeName: "RemoteNetwork"},
                {name: "groups", type: "Connection", typeName: "Group"},                      // deprecated
                {name: "serviceAccounts", type: "Connection", typeName: "ServiceAccount"},    // deprecated
                //{name: "access", type: "Connection", typeName: "AccessConnection"},         // future to replace groups & serviceAccounts
                {name: "isVisible", type: "boolean"},
                {name: "isBrowserShortcutEnabled", type: "boolean"},
                {name: "securityPolicy", type: "Node", typeName: "SecurityPolicy"}
            ]
        },
        "RemoteNetwork": {
            isNode: true,
            canCreate: true,
            queryNodeField: "remoteNetwork",
            queryConnectionField: "remoteNetworks",
            fields: [
                {name: "name", type: "string", isLabel: true},
                {name: "isActive", type: "boolean"},
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "resources", type: "Connection", typeName: "Resource"},
                {name: "connectors", type: "Connection", typeName: "Connector"}
            ]
        },
        "Connector": {
            isNode: true,
            fields: [
                {name: "name", type: "string", isLabel: true},
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "lastHeartbeatAt", type: "datetime"},
                {name: "state", type: "enum", typeName: "ConnectorState", valueMap: {"ALIVE": "Online", "DEAD_NO_HEARTBEAT": "Offline - No Heartbeat", "DEAD_HEARTBEAT_TOO_OLD": "Offline - Heartbeat too old", "DEAD_NO_RELAYS": "Offline - No relays"}},
                {name: "remoteNetwork", type: "Node", typeName: "RemoteNetwork"}
            ]
        },
        "Device": {
            isNode: true,
            fields: [
                {name: "name", type: "string", isLabel: true},
                {name: "user", type: "Node", typeName: "User"},
                {name: "isTrusted", type: "boolean"},
                {name: "lastConnectedAt", type: "datetime"},
                {name: "lastFailedLoginAt", type: "datetime"},
                {name: "lastSuccessfulLoginAt", type: "datetime"},
                {name: "deviceType", type: "enum", typeName: "DeviceType", valueMap: {"GENERIC": "Generic", "DESKTOP": "Desktop", "LAPTOP": "Laptop", "TABLET": "Tablet", "MOBILE": "Mobile"}},
                {name: "osName", type: "enum", typeName: "DeviceOsName", valueMap: {"IOS": "iOS", "MAC_OS": "MacOS", "ANDROID": "Android", "CHROME_OS": "chromeOS", "WINDOWS": "Windows", "LINUX": "Linux"}},
                {name: "osVersion", type: "string"},
                {name: "clientVersion", type: "string"},
                {name: "hardwareModel", type: "string"},
                {name: "hostname", type: "string"},
                {name: "username", type: "string"},
                {name: "serialNumber", type: "string"},
                {name: "manufacturerName", type: "string"}
            ]
        },
        "ServiceAccount": {
            isNode: true,
            queryNodeField: "serviceAccount",
            queryConnectionField: "serviceAccounts",
            fields: [
                {name: "name", type: "string", isLabel: true},
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "resources", type: "Connection", typeName: "Resource"},
                {name: "keys", type: "Object", typeName: "Key"}
            ]
        },
        "SecurityPolicy": {
            isNode: true,
            queryNodeField: "securityPolicy",
            queryConnectionField: "securityPolicies",
            fields: [
                {name: "name", type: "string", isLabel: true},
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "groups", type: "Connection", typeName: "Group"},
                {name: "policyType", type: "SecurityPolicyType"}
            ]
        }
        // END nodes
    }

    /**
     *
     * @param {string} networkName - Name of Twingate Account
     * @param {string} apiKey - API Key
     * @param {object} opts
     */
    constructor(networkName, apiKey, opts={}) {
        const dotIndex = networkName.indexOf('.');
        opts = opts || {};
        if ( dotIndex !== -1 ) {
            opts.domain = networkName.substring(dotIndex+1);
            networkName = networkName.substring(0, dotIndex);
        }
        const defaultOpts = {
            domain: "twingate.com",
            endpoint: "api/graphql/",
            defaultRequestOptions: {method: "POST"},
            defaultRequestHeaders: {"Content-Type": "application/json", 'Accept': 'application/json'},
            onApiError: null,
            logger: console,
            silenceApiErrorsWithResults: false,
            defaultPageSize: 0,
            applicationName: `Twingate-tg-cli/${TwingateApiClient.VERSION}`
        };

        const {domain, endpoint, defaultRequestOptions, defaultRequestHeaders, onApiError, logger,
            silenceApiErrorsWithResults, defaultPageSize, applicationName} = Object.assign(defaultOpts, opts);


        this.networkName = networkName;
        this.apiKey = apiKey;
        this.domain = domain;
        this.endpoint = endpoint;
        this.defaultPageSize = defaultPageSize;

        this.defaultRequestOptions = defaultRequestOptions;
        if ( defaultRequestHeaders["User-Agent"] === undefined ) defaultRequestHeaders["User-Agent"] = applicationName;
        this.defaultRequestHeaders = defaultRequestHeaders;

        this.onApiError = onApiError;
        this.logger = logger;
        this.silenceApiErrorsWithResults = silenceApiErrorsWithResults;
        this.opCounters = {
            "query": 0,
            "mutation": 0
        }
    }

    /**
     * Called if the GraphQL query returns an error object. If there is a custon onApiError handler then we will await
     * the results of it, otherwise we will throw an Error().
     * @param {string} query - GraphQL query
     * @param {object} variables - The variables that were provided to the GraphQL query
     * @param {Errors[]} errors - List of errors returned
     * @returns {Promise<*>} - the result of onApiError() (if there is one)
     * @throws {Error} - an error if no `onApiError` defined
     */
    async handleApiError(query, variables, response) {
        if ( typeof this.onApiError === "function") return await this.onApiError(this.networkName, query, variables, response);
        if ( response.data != null ) {
            let hasResults = response.data && response.data.result && Array.isArray(response.data.result.edges);
            let silenceApiError = hasResults && this.silenceApiErrorsWithResults;
            if ( !silenceApiError ) console.warn(`API Error on '${this.networkName}' for query: '${query}'. Errors: ${JSON.stringify(response.errors)}`);
            // Hack for problem with Devices that have no user associated
            if ( hasResults ) response.data.result.edges = response.data.result.edges.filter(e=> e!=null && e.node != null);
            return response.data;
        }
        throw new Error(`API Error on '${this.networkName}' for query: '${query}'. Errors: ${JSON.stringify(response.errors)}`);
    }

    /**
     * Executes a GraphQL Query
     * @param {string} query - The query to execute
     * @param {Object} variables - Any variables to include with the query
     * @returns {Promise<Object>} - The 'data' property of the result or the result of 'onApiError()' if defined.
     */
    async exec(query, variables = {}) {
        const url = `https://${this.networkName}.${this.domain}/${this.endpoint}`,
              body = JSON.stringify({query, variables}),
            opType = query.split(" ")[0]
        ;
        if ( typeof this.opCounters[opType] !== "number" ) this.opCounters[opType] = 0;
        let doFetch = true, res = null;
        while ( doFetch ) {
            this.opCounters[opType]++;
            res = await fetch(url, {
                ...this.defaultRequestOptions,
                headers: {
                    ...this.defaultRequestHeaders,
                    'X-API-KEY': this.apiKey
                },
                body
            });

            if ( res.status === 429 ) {
                let retryAfterSecs = parseInt(res.headers.get("retry-after")) || 60;
                this.logger.warn(`Request is throttled (429), retrying in: ${retryAfterSecs} seconds - please wait. Op type: '${opType}', Calls: ${this.opCounters[opType]}`);
                await delay(retryAfterSecs*1000);
            }
            else if ( res.status < 200 || res.status > 299 ) {
                throw new Error(`API returned status: ${res.status}. Query: ${body}`)
            }
            else {
                doFetch = false;
            }
        }

        let json = await res.json();
        if ( Array.isArray(json.errors) && json.errors.length > 0 ) return await this.handleApiError(query, variables, json);
        return json.data;
    }

    /**
     * Returns a GraphQL query to receive a pageable set of results for a Root Query Connection field
     * @param {string} queryName - Name of the query
     * @param {string} field - Name of the top level query field
     * @param {string|Array} nodeFields - Fields to query
     * @param {string} fieldAlias - Field alias (default: 'result')
     * @param {int} pageSize - page size to use (default: 0 - server determined)
     * @returns {string} - Query string
     */
    getRootConnectionPagedQuery(queryName, field, nodeFields, fieldAlias="result", pageSize=0) {
        const firstResults = pageSize>0 ? `first:${pageSize},` : "";
        fieldAlias = (fieldAlias != null && fieldAlias != field) ? `${fieldAlias}:` : "";
        if ( Array.isArray(nodeFields) ) nodeFields = nodeFields.join(" ");
        return `query ${queryName}($endCursor:String){${fieldAlias}${field}(${firstResults}after:$endCursor){pageInfo{hasNextPage endCursor}edges{node{${nodeFields}}}}}`;
    }

    /**
     * Returns a GraphQL query to receive a result for a Root Query Node (id lookup) field with one pageable Connection field
     * e.g. Given a Group ID we can page through all the Resources linked to it.
     * @param {string} queryName - Name of the query
     * @param {string} field - Name of the top level query field (should return a node and take an id parameter)
     * @param {string} connectionField - Name of the connection field to query (should be a sub-field of 'field')
     * @param {string|Array} nodeFields - Fields to query
     * @param {string} fieldAlias - Field alias (default: 'result')
     * @param {int} pageSize - page size to use (default: 0 - server determined)
     * @returns {string} - Query string
     */
    getRootNodePagedQuery(queryName, field, connectionField, nodeFields="id", fieldAlias="result", pageSize=0) {
        const firstResults = pageSize>0 ? `first:${pageSize},` : "";
        fieldAlias = (fieldAlias != null && fieldAlias != field) ? `${fieldAlias}:` : "";
        if ( Array.isArray(nodeFields) ) nodeFields = nodeFields.join(" ");
        return `query ${queryName}($id:ID!,$endCursor:String){${fieldAlias}${field}(id:$id){${connectionField}(${firstResults}after:$endCursor){pageInfo{hasNextPage endCursor}edges{node{${nodeFields}}}}}}`;
    }

    /**
     * Returns a GraphQL query to return a single object
     * @param {string} queryName - Name of the query
     * @param {string} field - Name of the top level query field
     * @param {string|Array} nodeFields - Fields to query
     * @param {string} fieldAlias - Field alias (default: 'result')
     * @returns {string} - Query string
     */
    getRootNodeQuery(queryName, field, nodeFields, fieldAlias="result") {
        fieldAlias = (fieldAlias != null && fieldAlias != field) ? `${fieldAlias}:` : "";
        if ( Array.isArray(nodeFields) ) nodeFields = nodeFields.join(" ");
        return `query ${queryName}($id:ID!){${fieldAlias}${field}(id:$id){${nodeFields}}}`;
    }

    /**
     * Returns a top-level GraphQL query for use in a Key-Value transformation
     * @param {string} queryName - Name of the query
     * @param {string} field - Name of the top level query field
     * @param {string} key - name of field that will be aliased to 'key'
     * @param {string} value - name of field that will be aliased to 'value'
     * @param {string} fieldAlias - Field alias (default: 'result')
     * @param {int} pageSize - page size to use (default: 0 - server determined)
     * @returns {string} - Query string
     */
    getTopLevelKVQuery(queryName, field, keyField, valueField, fieldAlias="result", pageSize=0, keyName="key", valueName= "value") {
        return this.getRootConnectionPagedQuery(queryName, field, `${valueName}:${valueField} ${keyName}:${keyField}`, fieldAlias, pageSize);
    }

    /**
     * Fetches all pages from a query
     * @param query - a Pageable query supporting an `endCursor` variable
     * @param opts - Options - TODO: Documentation
     * @returns {Promise<*>}
     */
    async fetchAllPages(query, opts = {}) {
        opts = opts || {};
        const getResultObjFn = opts.getResultObjFn || ((response) => response.result);
        const defaultOpts = {
            initialValue: [],
            recordTransformFn: (node, opts) => node,
            pageTransformFn: (response, rtnVal, recordTransformFn, recordTransformOpts) => {
                let r = getResultObjFn(response).edges.map(t => recordTransformFn(t.node, recordTransformOpts) );
                if ( Array.isArray(rtnVal) ) rtnVal.push(...r);
                return r;
            },
            nextPageFn: (response) => getResultObjFn(response).pageInfo,
            onPageFn: (result) => result,
            pageInfo: {hasNextPage: true, endCursor: null},
            recordTransformOpts: {},
            id: undefined
        };
        let {initialValue, recordTransformFn, pageTransformFn, nextPageFn, onPageFn, pageInfo, recordTransformOpts, id} = Object.assign(defaultOpts, opts);
        let rtnVal = initialValue;
        let response, result = null;
        while (pageInfo.hasNextPage === true) {
            response = await this.exec(query, {id, endCursor: pageInfo.endCursor});
            result = pageTransformFn(response, rtnVal, recordTransformFn, recordTransformOpts);
            onPageFn(result);
            pageInfo = nextPageFn(response);
        }
        return rtnVal;
    }



    async fetchAllRootNodePages(query, opts) {
        opts = opts || {};
        const getResultObjFn = opts.getResultObjFn || ((response) => response.result);
        const defaultOpts = {
            initialValue: [],
            recordTransformFn: (node, opts) => node,
            pageTransformFn: (response, rtnVal, recordTransformFn, recordTransformOpts) => {
                let r = getResultObjFn(response).edges.map(t => recordTransformFn(t.node, recordTransformOpts) );
                if ( Array.isArray(rtnVal) ) rtnVal.push(...r);
                return r;
            },
            nextPageFn: (response) => getResultObjFn(response).pageInfo,
            onPageFn: (result) => result,
            pageInfo: {hasNextPage: true, endCursor: null},
            recordTransformOpts: {},
            id: undefined
        };
        let {initialValue, recordTransformFn, pageTransformFn, nextPageFn, onPageFn, pageInfo, recordTransformOpts, id} = Object.assign(defaultOpts, opts);
        let rtnVal = initialValue;
        let response, result = null;
        let objectKey = ""
        while (pageInfo.hasNextPage === true) {
            response = await this.exec(query, {id, endCursor: pageInfo.endCursor});
            if (Object.keys(response.result).length != 1){
                throw new Error("Number of Connection Fields Cannot Be More Than 1.")
            }
            objectKey = Object.keys(response.result)[0]
            result = pageTransformFn({"result": response.result[objectKey]}, rtnVal, recordTransformFn, recordTransformOpts);
            onPageFn(result);
            pageInfo = nextPageFn({"result": response.result[objectKey]});
        }
        return rtnVal;
    }

    _processFetchOptions(nodeType, options, source) {
        const nodeSchema = TwingateApiClient.Schema[nodeType];
        if ( nodeSchema == null) throw new Error(`Cannot find schema for type: ${nodeType}`);
        let opts = Object.assign({}, options);
        opts.fieldSet = opts.fieldSet || [TwingateApiClient.FieldSet.ALL];
        const fieldOpts = Object.assign({}, opts.fieldOpts );

        // Todo: some of this can be moved into pre-process step
        for ( const connField of [...nodeSchema.connectionFields, ...nodeSchema.nodeFields] ) {
            fieldOpts[connField] = fieldOpts[connField] || {};
            let nodeFields = opts.defaultConnectionFields || "id";// TwingateApiClient.Schema[nodeSchema.fieldsByName[connField].typeName].labelField;
            fieldOpts[connField].joinConnectionFields = fieldOpts[connField].joinConnectionFields || opts.joinConnectionFields;
            if ( nodeFields === "LABEL_FIELD") nodeFields = TwingateApiClient.Schema[nodeSchema.fieldsByName[connField].typeName].labelField;
            fieldOpts[connField].nodeFields = fieldOpts[connField].nodeFields || nodeFields;//"id";
            if ( fieldOpts[connField].nodeFieldMapFn == null) {
                if ( Array.isArray(fieldOpts[connField].nodeFields) ) {
                    fieldOpts[connField].nodeFieldMapFn = ( (node) => node );
                }
                else {
                    fieldOpts[connField].nodeFieldMapFn = new Function("node", `return node.${fieldOpts[connField].nodeFields};`);
                }
            }
            if ( fieldOpts[connField].nodeQuery == null ) {
                fieldOpts[connField].nodeQuery = this.getRootNodePagedQuery(nodeSchema.nodeQueryName, nodeSchema.queryNodeField, connField, fieldOpts[connField].nodeFields, "result", this.defaultPageSize);
            }
            fieldOpts[connField].getResultObjFn = fieldOpts[connField].getResultObjFn || new Function("response", `return response.result.${connField}`);
        }
        return {opts, fieldOpts, nodeSchema};
    }

    async _processFetchConnections(nodeSchema, fieldOpts, record) {
        for ( const connectionField of nodeSchema.connectionFields ) {
            let options = fieldOpts[connectionField];
            if ( record[connectionField] == null ) continue;
            let pageInfo = record[connectionField].pageInfo;
            let pageResults = record[connectionField].edges.map(e=>e.node);
            if ( pageInfo != null && pageInfo.hasNextPage === true ) {
                pageResults.push(...await this.fetchAllPages(options.nodeQuery, {id: record.id, pageInfo, getResultObjFn: options.getResultObjFn}));
            }
            record[connectionField] = pageResults.map(options.nodeFieldMapFn);
            if ( typeof options.joinConnectionFields === "function" ) record[connectionField] = options.joinConnectionFields(record[connectionField]);
        }
    }

    async _fetchAllNodesOfType(nodeType, options) {
        let {opts, fieldOpts, nodeSchema} = this._processFetchOptions(nodeType, options, "All");
        const nodeFields = this._getFields(nodeType, opts.fieldSet, fieldOpts);
        const recordTransformFn = nodeSchema.recordTransformFn;
        const recordTransformOpts = opts.recordTransformOpts || {};
        const allNodesQuery = this.getRootConnectionPagedQuery(`All${nodeType}s`, nodeSchema.queryConnectionField, nodeFields, "result", this.defaultPageSize);
        let records = await this.fetchAllPages(allNodesQuery, {recordTransformFn, recordTransformOpts});


        for ( const record of records ) {
            await this._processFetchConnections(nodeSchema, fieldOpts, record);
        }
        return records;
    }

    async _fetchNodesOfTypeById(nodeType, id, options) {
        let {opts, fieldOpts, nodeSchema} = this._processFetchOptions(nodeType, options, "All");
        const nodeFields = this._getFields(nodeType, opts.fieldSet, fieldOpts);
        const recordTransformFn = nodeSchema.recordTransformFn;
        const recordTransformOpts = opts.recordTransformOpts || {};
        const nextPageFn = () => ({hasNextPage: false});
        const pageTransformFn = (response, rtnVal, recordTransformFn, recordTransformOpts) => Object.assign(rtnVal, recordTransformFn(response.result, recordTransformOpts));
        const query = this.getRootNodeQuery(`${nodeType}ById`, nodeSchema.queryNodeField, nodeFields, "result");
        let record = await this.fetchAllPages(query, {initialValue: {}, recordTransformFn, recordTransformOpts, nextPageFn, pageTransformFn, id});
        await this._processFetchConnections(nodeSchema, fieldOpts, record);
        return record;
    }


    //<editor-fold desc="Fetch All">
    async fetchAll(opts) {
        let rtnVal = {};
        opts = opts || {};
        let nodeNames = opts.typesToFetch || Object
            .values( TwingateApiClient.Schema )
            .filter( s => s.isNode )
            .map( s => s.name )
        ;
        let nodes = nodeNames
            .map( s => this._fetchAllNodesOfType(s, opts))
        ;
        let results = await Promise.all(nodes);
        for ( let x = 0; x < nodeNames.length; x++ ) rtnVal[nodeNames[x]] = results[x];
        return rtnVal
    }

    async fetchAllConnectors(opts) {
        return this._fetchAllNodesOfType("Connector", opts);
    }

    async fetchAllDevices(opts) {
        return this._fetchAllNodesOfType("Device", opts);
    }

    async fetchAllServiceAccounts(opts) {
        return this._fetchAllNodesOfType("ServiceAccount", opts);
    }

    async fetchAllUsers(opts) {
        return this._fetchAllNodesOfType("User", opts);
    }

    async fetchAllResources(opts) {
        return this._fetchAllNodesOfType("Resource", opts);
    }

    async fetchAllRemoteNetworks(opts) {
        return this._fetchAllNodesOfType("RemoteNetwork", opts);
    }

    async fetchAllGroups(opts) {
        return this._fetchAllNodesOfType("Group", opts);
    }

    async fetchAllSecurityPolicies(opts) {
        return this._fetchAllNodesOfType("SecurityPolicy", opts);
    }
    //</editor-fold>

    //<editor-fold desc="Fetch by Id">
    async fetchConnectorById(id, opts) {
        return this._fetchNodesOfTypeById("Connector", id, opts);
    }

    async fetchDeviceById(id, opts) {
        return this._fetchNodesOfTypeById("Device", id, opts);
    }

    async fetchUserById(id, opts) {
        return this._fetchNodesOfTypeById("User", id, opts);
    }

    async fetchResourceById(id, opts) {
        return this._fetchNodesOfTypeById("Resource", id, opts);
    }

    async fetchRemoteNetworkById(id, opts) {
        return this._fetchNodesOfTypeById("RemoteNetwork", id, opts);
    }

    async fetchGroupById(id, opts) {
        return this._fetchNodesOfTypeById("Group", id, opts);
    }
    //</editor-fold>

    _getFields(schemaName, fieldSet=[TwingateApiClient.FieldSet.ALL], fieldOptions={}) {
        const schema = TwingateApiClient.Schema[schemaName];
        const fieldSchema = schema.fields;
        /*fieldOverrides = {
            "groups": {nodeFields: "name"}
        }*/
        let fieldFilter = (f) => f.ignore !== true;
        if ( typeof fieldSet === "function" ) {
            // TODO
        }
        else if ( !fieldSet.includes(TwingateApiClient.FieldSet.ALL) ) {
            let fieldsToInclude = fieldOptions.extraFields || [];
            if ( fieldSet.includes(TwingateApiClient.FieldSet.ID) ) fieldsToInclude.push("id");
            if ( fieldSet.includes(TwingateApiClient.FieldSet.LABEL) ) fieldsToInclude.push(schema.labelField);
            if ( fieldSet.includes(TwingateApiClient.FieldSet.CONNECTIONS) ) fieldsToInclude.push(...schema.connectionFields);
            if ( fieldSet.includes(TwingateApiClient.FieldSet.NODES) ) fieldsToInclude.push(...schema.nodeFields);
            fieldFilter = (f) => fieldsToInclude.includes(f.name);
        }

        fieldOptions = fieldOptions || {};
        const fieldSchemaCtx = fieldSchema
            .map(f => Object.assign({}, f, fieldOptions[f.name]))
            .filter(fieldFilter)
        ;
        return fieldSchemaCtx.map(fieldDef => {
            switch (fieldDef.type) {
                case "Object": return `${fieldDef.name}{${fieldDef.nodeFields||this._getFields(fieldDef.typeName, fieldDef.fieldSet, fieldDef.fieldOptions)}}`;
                case "Node": return `${fieldDef.name}{${fieldDef.nodeFields||this._getFields(fieldDef.typeName, fieldDef.fieldSet || fieldSet, fieldDef.fieldOptions)}}`;
                case "Connection": return `${fieldDef.name}{pageInfo{hasNextPage endCursor}edges{node{${fieldDef.nodeFields||"id"}}}}`;
                default: return fieldDef.name;
            }
        }).join(" ");
    }

    /**
     * Add a userId or list of userIds to a Group
     * @param {string} groupId - Twingate Group Id
     * @param {string|string[]} userId - userId or userIds to add
     * @returns {Promise<*>} - GraphQL entity
     * Todo: check if the group or users exist
     */
    async addUserToGroup(groupId, userId) {
        let userIds = ( Array.isArray(userId) ? userId : [userId]);
        const groupQuery = "mutation AddUserToGroup($groupId:ID!,$userIds:[ID]){groupUpdate(id:$groupId,addedUserIds:$userIds){error entity{id name users{edges{node{id email}}}}}}";
        let groupsResponse = await this.exec(groupQuery, {groupId, userIds} );
        return groupsResponse.groupUpdate.entity;
    }


    async addResourceToServiceAccount(serviceAccountId, resourceId) {
        let resourceIds = ( Array.isArray(resourceId) ? resourceId : [resourceId]);
        const serviceAccountQuery = "mutation AddResourceToServiceAccount($serviceAccountId:ID!,$resourceIds:[ID]){serviceAccountUpdate(id:$serviceAccountId,addedResourceIds:$resourceIds){error entity{id name resources{edges{node{id name}}}}}}";
        let serviceAccountResponse = await this.exec(serviceAccountQuery, {serviceAccountId, resourceIds} );
        return serviceAccountResponse.serviceAccountUpdate.entity;
    }

    async removeResourceFromServiceAccount(serviceAccountId, resourceId) {
        let resourceIds = ( Array.isArray(resourceId) ? resourceId : [resourceId]);
        const serviceAccountQuery = "mutation RemoveResourceFromServiceAccount($serviceAccountId:ID!,$resourceIds:[ID]){serviceAccountUpdate(id:$serviceAccountId,removedResourceIds:$resourceIds){error entity{id name resources{edges{node{id name}}}}}}";
        let serviceAccountResponse = await this.exec(serviceAccountQuery, {serviceAccountId, resourceIds} );
        return serviceAccountResponse.serviceAccountUpdate.entity;
    }

    async addGroupToResource(resourceId, groupIds){
        const addGrouptoResourceQuery = "mutation AddGroupToResource($resourceId:ID!,$groupIds:[ID]){resourceUpdate(id:$resourceId,addedGroupIds:$groupIds){error entity{id name groups{edges{node{id name}}}}}}";
        let resourceResponse = await this.exec(addGrouptoResourceQuery, {resourceId, groupIds} );
        return resourceResponse.resourceUpdate.entity;
    }

    async assignGroupToPolicy(groupId, securityPolicyId){
        const assignGroupToPolicyQuery = "mutation attachGroupToPolicy($groupId:ID!, $securityPolicyId: ID!){groupUpdate(id:$groupId,securityPolicyId: $securityPolicyId){error entity{id name securityPolicy{id name}}}}";
        let resourceResponse = await this.exec(assignGroupToPolicyQuery, {groupId, securityPolicyId} );
        return resourceResponse.groupUpdate.entity;
    }

    async addGroupToPolicy(securityPolicyId, groupIds){
        const assignGroupToPolicyQuery = "mutation addGroupToPolicy($securityPolicyId:ID!, $groupIds:[ID]){securityPolicyUpdate(id: $securityPolicyId, addedGroupIds:$groupIds){error entity{id name groups{edges{node{id name}}}}}}";
        let resourceResponse = await this.exec(assignGroupToPolicyQuery, {securityPolicyId, groupIds} );
        return resourceResponse.securityPolicyUpdate.entity;
    }

    async addResourceToGroup(groupId, resourceIds){
        const addResourceToGroupQuery = "mutation AddResourceToGroup($groupId:ID!,$resourceIds:[ID]){groupUpdate(id:$groupId,addedResourceIds:$resourceIds){error entity{id name resources{edges{node{id name}}}}}}";
        let groupsResponse = await this.exec(addResourceToGroupQuery, {groupId, resourceIds} );
        return groupsResponse.groupUpdate.entity;
    }

    /**
     * Removes a userId or list of userIds from a Group
     * @param {string} groupId - Twingate Group Id
     * @param {string|string[]} userId - userId or userIds to remove
     * @returns {Promise<*>} - GraphQL entity
     */
    async removeUserFromGroup(groupId, userId) {
        let userIds = ( Array.isArray(userId) ? userId : [userId]);
        const groupQuery = "mutation RemoveUserFromGroup($groupId:ID!,$userIds:[ID]){groupUpdate(id:$groupId,removedUserIds:$userIds){error entity{id name users{edges{node{id email}}}}}}";
        let groupsResponse = await this.exec(groupQuery, {groupId, userIds} );
        return groupsResponse.groupUpdate.entity;
    }


    /**
     * Removes a groupId or list of groupIds from a Group
     * @param {string} resourceId - Twingate Resource Id
     * @param {string|string[]} groupId - groupId or groupIds to remove
     * @returns {Promise<*>} - GraphQL entity
     */
    async removeGroupFromResource(resourceId, groupId) {
        let groupIds = ( Array.isArray(groupId) ? groupId : [groupId]);
        const resourceQuery = "mutation RemoveGroupFromResource($resourceId:ID!,$groupIds:[ID]){resourceUpdate(id:$resourceId,removedGroupIds:$groupIds){error entity{id name groups{edges{node{id name}}}}}}";
        let resourcesResponse = await this.exec(resourceQuery, {resourceId, groupIds} );
        return resourcesResponse.resourceUpdate.entity;
    }

    /**
     * Removes a groupId or list of groupIds from a Group
     * @param {string} resourceId - Twingate Resource Id
     * @param {string|string[]} groupId - groupId or groupIds to remove
     * @returns {Promise<*>} - GraphQL entity
     */
    async removeResourceFromGroup(groupId, resourceId) {
        let resourceIds = ( Array.isArray(resourceId) ? resourceId : [resourceId]);
        const groupQuery = "mutation RemoveResourceFromGroup($groupId:ID!,$resourceIds:[ID]){groupUpdate(id:$groupId,removedResourceIds:$resourceIds){error entity{id name resources{edges{node{id name}}}}}}";
        let groupResponse = await this.exec(groupQuery, {groupId, resourceIds} );
        return groupResponse.groupUpdate.entity;
    }



    /**
     * @param {string} groupId - Twingate Group Id
     * @param {string[]} userIds - userIds to remove
     * @param {string[]} resourceIds - resourceIds to remove
     * @returns {Promise<*>} - GraphQL entity
     */
    async setGroupUsersAndResources(groupId, userIds, resourceIds) {
        let variables = ["$groupId:ID!"];
        let params = ["id:$groupId"];
        if ( userIds != null ) {
            variables.push("$userIds:[ID]");
            params.push("userIds:$userIds");
        }
        if ( resourceIds != null ) {
            variables.push("$resourceIds:[ID]");
            params.push("resourceIds:$resourceIds");
        }
        const query = `mutation SetGroupUsersAndResources(${variables.join(",")}){result:groupUpdate(${params.join(",")}){ok error}}`;
        let response = await this.exec(query, {groupId, userIds, resourceIds} );
        return response.result;
    }

    async loadCompleteGroup(name) {
        let networkName = this.networkName, apiKey = this.apiKey;
        const groupsQuery = "query Groups($name:String){groups(filter:{name:{eq:$name}}){edges{node{id name users{pageInfo{hasNextPage endCursor}edges{node{id}}}resources{pageInfo{hasNextPage endCursor}edges{node{id}}}}}}}";
        let groupsResponse = await this.exec(groupsQuery, {name} );
        let numGroups = groupsResponse.groups.edges.length;
        if ( numGroups !== 1 ) {
            this.logger.warn(`Searching for group with name '${name}' returned ${numGroups} results.`)
            return;
        }

        let group = groupsResponse.groups.edges[0].node;
        let usersPageInfo = group.users.pageInfo;
        group.userIds = group.users.edges.map ( e => e.node.id );
        let resourcesPageInfo = group.resources.pageInfo;
        group.resourceIds = group.resources.edges.map ( e => e.node.id );

        while (usersPageInfo.hasNextPage === true) {
            let userResults = await loadGroupUsers(networkName, apiKey, group.id, usersPageInfo.endCursor);
            group.userIds.push(...userResults.ids);
            usersPageInfo = userResults.pageInfo;
        }

        while (resourcesPageInfo.hasNextPage === true) {
            let resourceResults = await loadGroupResources(networkName, apiKey, group.id, resourcesPageInfo.endCursor);
            group.resourceIds.push(...resourceResults.ids);
            resourcesPageInfo = resourceResults.pageInfo;
        }

        return group;
    }

    async lookupRemoteNetworkByName(name) {
        const query = "query RemoteNetworkByName($name:String){remoteNetworks(filter:{name:{eq:$name}}){edges{node{id}}}}";
        let response = await this.exec(query, {name: ""+name.trim()});
        let result = response.remoteNetworks;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    //todo: waiting for feature request
    async lookupSecurityPolicyByName(name) {
        const query = "query SecurityPolicyByName($name:String){securityPolicies(filter:{name:{eq:$name}}){edges{node{id}}}}";
        let response = await this.exec(query, {name: ""+name.trim()});
        let result = response.securityPolicies;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    async lookupGroupByName(name) {
        const query = "query GroupByName($name:String){groups(filter:{name:{eq:$name}}){edges{node{id}}}}";
        let response = await this.exec(query, {name: ""+name.trim()});
        let result = response.groups;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    // todo: waiting on feature request
    async lookupUserByEmail(email) {
        const query = "query UserByEmail($email:String){users(filter:{email:{eq:$email}}){edges{node{id}}}}";
        let response = await this.exec(query, {email: ""+email.trim()});
        let result = response.users;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    async lookupResourceByName(name) {
        const query = "query ResourceByName($name:String){resources(filter:{name:{eq:$name}}){edges{node{id}}}}";
        let response = await this.exec(query, {name: ""+name.trim()});
        let result = response.resources;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    async lookupDeviceBySerial(serialNumber) {
        const query = "query DeviceBySerial($serialNumber:String){devices(filter:{serialNumber:{eq:$serialNumber}}){edges{node{id}}}}";
        let response = await this.exec(query, {serialNumber: ""+serialNumber.trim()});
        let result = response.devices;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges[0].node.id;
    }

    async lookupDevicesBySerial(serialNumber) {
        const query = "query DeviceBySerial($serialNumber:String){devices(filter:{serialNumber:{eq:$serialNumber}}){edges{node{id}}}}";
        let response = await this.exec(query, {serialNumber: ""+serialNumber.trim()});
        let result = response.devices;
        if ( result == null || result.edges == null || result.edges.length < 1 ) return null;
        return result.edges.map(edge => edge.node.id);
    }


    async setDeviceTrust(id, isTrusted) {
        const setDeviceTrustQuery = "mutation SetDeviceTrust($id:ID!,$isTrusted:Boolean!){result:deviceUpdate(id:$id,isTrusted:$isTrusted){ok error entity{id name serialNumber isTrusted}}}";
        let deviceTrustResponse = await this.exec(setDeviceTrustQuery, {id, isTrusted} );
        if ( deviceTrustResponse.result.error !== null ) throw new Error(`Error setting device trust: '${deviceTrustResponse.result.error}'`)
        return deviceTrustResponse.result.entity;
    }


    async createGroup(name, resourceIds=[], userIds=[]) {
        const createGroupQuery = "mutation CreateGroup($name:String!,$resourceIds:[ID],$userIds:[ID]){result:groupCreate(name:$name,resourceIds:$resourceIds,userIds:$userIds){error entity{id name users{edges{node{id email}}}}}}";
        let groupsResponse = await this.exec(createGroupQuery, {name, resourceIds, userIds} );
        if ( groupsResponse.result.error !== null ) throw new Error(`Error creating group: '${groupsResponse.result.error}'`)
        return groupsResponse.result.entity;
    }

    async createRemoteNetwork(name) {
        const createRemoteNetworkQuery = "mutation CreateRemoteNetwork($name:String!){result:remoteNetworkCreate(name:$name){error entity{id}}}";
        let createRemoteNetworkResponse = await this.exec(createRemoteNetworkQuery, {name} );
        if ( createRemoteNetworkResponse.result.error !== null ) throw new Error(`Error creating remote network: '${createRemoteNetworkResponse.result.error}'`)
        return createRemoteNetworkResponse.result.entity;
    }

    async createServiceAccount(name, resourceIds=[]) {
        const createServiceAccountQuery = "mutation CreateServiceAccount($name:String!,$resourceIds:[ID]){result:serviceAccountCreate(name:$name,resourceIds:$resourceIds){error entity{id name resources{edges{node{id name}}}}}}";
        let serviceAccountResponse = await this.exec(createServiceAccountQuery, {name, resourceIds} );
        if ( serviceAccountResponse.result.error !== null ) throw new Error(`Error creating service account: '${serviceAccountResponse.result.error}'`)
        return serviceAccountResponse.result.entity;
    }

    async updateRemoteNetwork(id, isActive=null, name=null) {
        let variables = {id},
            gqlParams = ["$id:ID"],
            gqlArgs = ["id:$id"]
        ;
        if ( isActive === true || isActive === false ) {
            variables.isActive = isActive;
            gqlParams.push("$isActive:Boolean");
            gqlArgs.push("isActive:$isActive");
        }
        if ( typeof name === "string" ) {
            variables.name = name;
            gqlParams.push("$name:String");
            gqlArgs.push("name:$name");
        }

        const query = `mutation UpdateRemoteNetwork(${gqlParams.join(",")}){result:remoteNetworkUpdate(${gqlArgs.join(",")}){ok error entity{id}}}`;
        let response = await this.exec(query, variables);
        if ( response.result.error !== null ) throw new Error(`Error updating remote network: '${response.result.error}'`)
        return response.result.entity;
    }

    async createConnector(remoteNetworkId) {
        const createConnectorQuery = "mutation CreateConnector($remoteNetworkId:ID!){result:connectorCreate(remoteNetworkId:$remoteNetworkId){error entity{id name remoteNetwork{name}}}}";
        let createConnectorResponse = await this.exec(createConnectorQuery, {remoteNetworkId} );
        if ( createConnectorResponse.result.error !== null ) throw new Error(`Error creating connector: '${createConnectorResponse.result.error}'`)
        return createConnectorResponse.result.entity;
    }

    async setConnectorName(id, name) {
        const setConnectorNameQuery = "mutation SetConnectorName($id:ID!,$name:String){result:connectorUpdate(id:$id,name:$name){error entity{id name}}}";
        let setConnectorNameResponse = await this.exec(setConnectorNameQuery, {id, name} );
        if ( setConnectorNameResponse.result.error !== null ) throw new Error(`Error setting connector name: '${setConnectorNameResponse.result.error}'`)
        return setConnectorNameResponse.result.entity;
    }


    async generateConnectorTokens(connectorId) {
        const query = "mutation GenerateTokens($connectorId:ID!){result:connectorGenerateTokens(connectorId:$connectorId){error ok connectorTokens{accessToken refreshToken}}}";
        let response = await this.exec(query, {connectorId} );
        if ( response.result.error !== null ) throw new Error(`Error setting connector name: '${response.result.error}'`)
        return response.result.connectorTokens;
    }

    async serviceAccountKeyCreate(serviceAccountId, name, expirationTime) {
        const query = "mutation CreateKey($serviceAccountId:ID!, $name:String,$expirationTime:Int!){result:serviceAccountKeyCreate(serviceAccountId:$serviceAccountId,name:$name,expirationTime:$expirationTime){error token entity{id name serviceAccount{id name}}}}";
        let response = await this.exec(query, {serviceAccountId, name, expirationTime} );
        if ( response.result.error !== null ) throw new Error(`Error creating service account key: '${response.result.error}'`)
        return response.result;
    }

    async serviceAccountKeyDelete(serviceAccountKeyId) {
        const revokeQuery = "mutation RevokeKey($serviceAccountKeyId:ID!){result:serviceAccountKeyRevoke(id:$serviceAccountKeyId){error entity{id name serviceAccount{id name}}}}";
        const deleteQuery = "mutation DeleteKey($serviceAccountKeyId:ID!){result:serviceAccountKeyDelete(id:$serviceAccountKeyId){error ok}}"
        let revokeResponse = await this.exec(revokeQuery, {serviceAccountKeyId} );
        if ( revokeResponse.result.error !== null ) throw new Error(`Error Revoking service account key: '${revokeResponse.result.error}'`)
        let deleteResponse = await this.exec(deleteQuery, {serviceAccountKeyId} );
        if ( deleteResponse.result.error !== null ) throw new Error(`Error Deleting service account key: '${deleteResponse.result.error}'`)
        return revokeResponse.result;
    }


    async createResource(address, alias = null, groupIds = [], isBrowserShortcutEnabled = null, isVisible = null, name, protocols = null, remoteNetworkId, securityPolicyId = null) {
        const createResourceQuery = "mutation CreateResource($address:String!,$alias:String,$groupIds:[ID],$isBrowserShortcutEnabled:Boolean,$isVisible:Boolean,$name:String!,$protocols:ProtocolsInput,$remoteNetworkId:ID!,$securityPolicyId:ID){result:resourceCreate(address:$address,alias:$alias,groupIds:$groupIds,isBrowserShortcutEnabled:$isBrowserShortcutEnabled,isVisible:$isVisible,name:$name,protocols:$protocols,remoteNetworkId:$remoteNetworkId,securityPolicyId:$securityPolicyId){ok error entity{id name address{value} remoteNetwork{name} groups{edges{node{id name}}}}}}";
        let createResourceResponse = await this.exec(createResourceQuery, {address, alias, groupIds, isBrowserShortcutEnabled, isVisible, name, protocols, remoteNetworkId, securityPolicyId});
        if ( createResourceResponse.result.error !== null ) throw new Error(`Error creating resource: '${createResourceResponse.result.error}'`)
        return createResourceResponse.result.entity;
    }

    async updateResource(addedGroupIds = [], address, alias = null, groupIds = [], id, isActive, isBrowserShortcutEnabled = null, isVisible = null, name, protocols = null, remoteNetworkId, removedGroupIds = [], securityPolicyId = null) {
        const updateResourceQuery = "mutation UpdateResource($addedGroupIds:[ID],$address:String,$alias:String,$groupIds:[ID],$id:ID!,$isActive:Boolean,$isBrowserShortcutEnabled:Boolean,$isVisible:Boolean,$name:String,$protocols:ProtocolsInput,$remoteNetworkId:ID,$removedGroupIds:[ID],$securityPolicyId:ID){result:resourceUpdate(addedGroupIds:$addedGroupIds,address:$address,alias:$alias,groupIds:$groupIds,id:$id,isActive:$isActive,isBrowserShortcutEnabled:$isBrowserShortcutEnabled,isVisible:$isVisible,name:$name,protocols:$protocols,remoteNetworkId:$remoteNetworkId,removedGroupIds:$removedGroupIds,securityPolicyId:$securityPolicyId){ok error entity{id name address{value} remoteNetwork{name} groups{edges{node{id name}}}}}}";
        let updateResourceResponse = await this.exec(updateResourceQuery, {addedGroupIds, address, alias, groupIds, id, isActive, isBrowserShortcutEnabled, isVisible, name, protocols, remoteNetworkId, removedGroupIds, securityPolicyId} );
        if ( updateResourceResponse.result.error !== null ) throw new Error(`Error updating resource: '${updateResourceResponse.result.error}'`);
        return updateResourceResponse.result;
    }

    async removeGroup(id) {
        const removeGroupQuery = "mutation RemoveGroup($id:ID!){result:groupDelete(id:$id){ok, error}}";
        let removeGroupResponse = await this.exec(removeGroupQuery, {id});
        if ( !removeGroupResponse.result.ok ) throw new Error(`Error removing group '${id}' ${removeGroupResponse.result.error}`);
        return true;
    }

    async removeRemoteNetwork(id) {
        const removeRemoteNetworkQuery = "mutation RemoveRemoteNetwork($id:ID!){result:remoteNetworkDelete(id:$id){ok, error}}";
        let removeRemoteNetworkResponse = await this.exec(removeRemoteNetworkQuery, {id});
        if ( !removeRemoteNetworkResponse.result.ok ) throw new Error(`Error removing remote network '${id}' ${removeRemoteNetworkResponse.result.error}`);
        return true;
    }

    async removeResource(id) {
        const removeResourceQuery = "mutation RemoveResource($id:ID!){result:resourceDelete(id:$id){ok, error}}";
        let removeResourceResponse = await this.exec(removeResourceQuery, {id});
        if ( !removeResourceResponse.result.ok ) throw new Error(`Error removing resource '${id}' ${removeResourceResponse.result.error}`);
        return true;
    }

    async removeServiceAccount(id) {
        const removeServiceAccountQuery = "mutation RemoveServiceAccount($id:ID!){result:serviceAccountDelete(id:$id){ok, error}}";
        let removeServiceAccountResponse = await this.exec(removeServiceAccountQuery, {id});
        if ( !removeServiceAccountResponse.result.ok ) throw new Error(`Error removing group '${id}' ${removeServiceAccountResponse.result.error}`);
        return true;
    }

    //<editor-fold desc="Bulk APIs (very experimental)">

    // Full docs TBD but input should be array of objects with {...id: ID, isTrusted: boolean}
    // Caller must check for errors!
    async setDeviceTrustBulk(devices, idFieldFn = (d) => d.id, isTrustedFieldFn = (d) => d.isTrusted) {
        if ( !Array.isArray(devices)  ) throw new Error(`setDeviceTrustBulk requires an array as input.`);
        if ( devices.length === 0 ) return [];
        if ( !devices.every( device => typeof device.id === "string" && typeof device.isTrusted === "boolean" ) ) throw new Error(`setDeviceTrustBulk requires every item to have an 'id' (string) and 'isTrusted' (boolean) value`);

        const gqlParams = devices.map( (_, i) => `$id${i}:ID!,$isTrusted${i}:Boolean!`).join(",");
        const gqlMutationParts = devices.map( (_, i) => `result${i}:deviceUpdate(id:$id${i},isTrusted:$isTrusted${i}){ok error entity{id isTrusted}}`).join(" ");
        const gqlVariables = Object.fromEntries(devices.flatMap( (d, i) => [[`id${i}`, idFieldFn(d)], [`isTrusted${i}`, isTrustedFieldFn(d) ]]));
        let bulkSetTrustQuery = `mutation BulkSetDeviceTrust${devices.length}(${gqlParams}){${gqlMutationParts}}`;
        let bulkDeviceTrustResponse = await this.exec(bulkSetTrustQuery, gqlVariables );

        let results = [];
        for ( let x = 0; x < devices.length; x++ ) {
            results.push(bulkDeviceTrustResponse[`result${x}`]);
        }
        return results;
    }


    async removeGroupsBulk(ids) {
        if ( !Array.isArray(ids)  ) throw new Error(`removeGroupsBulk requires an array as input.`);
        if ( ids.length === 0 ) return [];
        if ( !ids.every( id => typeof id === "string" && id.startsWith(TwingateApiClient.IdPrefixes.Group) ) ) throw new Error(`removeGroupsBulk requires every value to be a Group Id`);
        for ( let x = 0; x < ids.length; x++ ) {
            try {
                await this.removeGroup(ids[x]);
            } catch (e) {
                console.error(e);
            }
        }
        return true;
    }

    async removeRemoteNetworksBulk(ids) {
        const removeRemoteNetworkQuery = "mutation RemoveRemoteNetwork($id:ID!){result:remoteNetworkDelete(id:$id){ok, error}}";
        let removeRemoteNetworkResponse = await this.exec(removeRemoteNetworkQuery, {id});
        if ( !removeRemoteNetworkResponse.result.ok ) throw new Error(`Error removing remote network '${id}' ${removeRemoteNetworkResponse.result.error}`);
        return true;
    }

    async removeResourcesBulk(ids) {
        const removeResourceQuery = "mutation RemoveResource($ids:ID!){result:resourceDelete(id:$ids){ok, error}}";
        let removeResourceResponse = await this.exec(removeResourceQuery, {ids});
        if ( !removeResourceResponse.result.ok ) throw new Error(`Error removing resource '${ids}' ${removeResourceResponse.result.error}`);
        return true;
    }


    //</editor-fold>

    /**
     * Test whether a network name appears valid
     * @returns {boolean} -
     */
    static async testNetworkValid(networkName) {
        let url = ( networkName.indexOf('.') === -1 ) ? `https://${networkName}.twingate.com/api/graphql/?testNetworkValid` : `https://${networkName}/api/graphql/?testNetworkValid`;
        let rsp = await fetch(url);
        return rsp.status !== 404;
    }
    /**
     * Given a network name and API key test whether an API key appears valid
     * @returns {boolean} -
     */
    static async testApiKeyValid(networkName, apiKey) {
        // Assuming network is valid, an invalid API key should return a 401. Otherwise we can expect probably a 400
        // since we provide no query on this request
        let url = ( networkName.indexOf('.') === -1 ) ? `https://${networkName}.twingate.com/api/graphql/?testApiKeyValid` : `https://${networkName}/api/graphql/?testApiKeyValid`;
        let rsp = await fetch(url, {headers: {'X-API-KEY': apiKey}} );
        return rsp.status !== 401;
    }
}


(function preProcessSchema() {
    try {
        for ( const [typeName, typeProps] of Object.entries(TwingateApiClient.Schema) ) {
            typeProps.name = typeName;
            typeProps.fieldsByName = {};
            typeProps.fields.reduce((obj, item) => (obj[item.name] = item, obj), typeProps.fieldsByName)
            typeProps.dateTimeFields = typeProps.fields.filter(f => f.type === "datetime").map(f => f.name);
            typeProps.enumFields = typeProps.fields.filter(f => f.type === "enum").map(f => f.name);
            typeProps.connectionFields = typeProps.fields.filter(f => f.type === "Connection").map(f => f.name);
            typeProps.nodeFields = typeProps.fields.filter(f => f.type === "Node").map(f => f.name);
            typeProps.objectFields = typeProps.fields.filter(f => f.type === "Object").map(f => f.name);
            const labelFields = typeProps.fields.filter(f => f.isLabel === true);
            if (labelFields.length === 1) typeProps.labelField = labelFields[0].name;
            if (typeProps.isNode === true) {
                typeProps.fields.unshift({name: "id", type: "string", primaryKey: true});
                typeProps.queryNodeField = typeProps.queryNodeField || typeName.toLowerCase();
                typeProps.nodeQueryName = typeProps.nodeQueryName || `Query${typeName}`;
                typeProps.queryConnectionField = typeProps.queryConnectionField || `${typeProps.queryNodeField}s`;

                let labelFieldArr = typeProps.fields.filter(f => f.isLabel);
                if (labelFieldArr.length === 1) typeProps.labelField = labelFieldArr[0].name;
                else this.logger.warn(`No label field found for type '${typeName}'!`);
            }
        }

        const flattenStatements = (prefix, fieldDef) => {
            if ( !Array.isArray(prefix) ) prefix = [prefix];
            let schema = TwingateApiClient.Schema[fieldDef.typeName];
            let stmts = [];
            // TODO: handle type.multiple === true
            for ( let fieldDef of schema.fields ) {
                let stmt = "";
                let path = [...prefix, fieldDef.name];
                let flattenStmtsFn = fieldDef.flattenStatementsFn ? fieldDef.flattenStatementsFn : flattenStatements;
                switch (fieldDef.type) {
                    case "Object":
                        stmts.push(...flattenStmtsFn(path, fieldDef));
                        break;
                    default:
                        let flattenedPropName = path.map( (e, i) => (i === 0 ? e : _capitalise(e) ) );
                        stmts.push(`obj["${flattenedPropName.join("")}"] = obj.${path.join(".")};`);
                        break;
                }
            }
            return stmts;
        };

        for ( const [typeName, typeProps] of Object.entries(TwingateApiClient.Schema) ) {
            let mappingFnStatements = [`opts = opts || {mapDateFields: true};`];
            mappingFnStatements.push(`if ( opts.mapEnumToDisplay === true ) {`);
            mappingFnStatements.push(...typeProps.enumFields.map(f=>`    if ( obj["${f}"] != undefined ) { let vm = ${JSON.stringify(typeProps.fieldsByName[f].valueMap)}; obj["${f}"] = vm[obj["${f}"]];}`));
            mappingFnStatements.push(`}`);
            mappingFnStatements.push(`if ( opts.mapDateFields === true ) {`);
            mappingFnStatements.push(...typeProps.dateTimeFields.map(f=>`    if ( obj["${f}"] != undefined ) obj["${f}"] = new Date(obj["${f}"]);`));
            mappingFnStatements.push(`}`);
            mappingFnStatements.push(`if ( opts.mapNodeToId === true ) {`);
            mappingFnStatements.push(...typeProps.nodeFields.map(f=>`    if ( obj["${f}"] != undefined ) obj["${f}Id"] = obj["${f}"].id;`));
            mappingFnStatements.push(`}`);
            mappingFnStatements.push(`if ( opts.mapNodeToLabel === true ) {`);
            mappingFnStatements.push(...typeProps.nodeFields.map(f=>`    if ( obj["${f}"] != undefined ) obj["${f}Label"] = obj["${f}"].${TwingateApiClient.Schema[typeProps.fieldsByName[f].typeName].labelField};`));
            mappingFnStatements.push(`}`);
            mappingFnStatements.push(`if ( opts.mapNodeToLabel || opts.mapNodeToId ) {`);
            mappingFnStatements.push(...typeProps.nodeFields.map(f=>`    delete obj["${f}"];`));
            mappingFnStatements.push(`}`);
            mappingFnStatements.push(`if ( opts.flattenObjectFields === true ) {`);
            for ( const f of typeProps.objectFields ) {
                mappingFnStatements.push(`    if ( obj["${f}"] !== undefined ) {`);
                mappingFnStatements.push(...flattenStatements(f, typeProps.fieldsByName[f] ).map(s => `        ${s}`));
                mappingFnStatements.push(`        delete obj["${f}"];`);
                mappingFnStatements.push(`    }`);

            }
            mappingFnStatements.push(`}`);

            mappingFnStatements.push("return obj;");
            typeProps.recordTransformFn = new Function("obj", "opts={}", mappingFnStatements.join("\r\n"));


        }
    }
    catch (e) {
        console.error(`Problem pre-processing schema: ${e.stack}`);
    }
})();
