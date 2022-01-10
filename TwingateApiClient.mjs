

const _capitalise = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
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
                    flattenStatementsFn: (path, fieldDef) => [`obj["${path.map( (e, i) => i == 0 ? e : _capitalise(e) ).join("")}"] = obj.${path.join(".")}.map(port => (port.start === port.end ? port.start : \`\${port.start}-\${port.end}\`)).join(", ");`]
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
                {name: "name", type: "string", isLabel: true, canQuery: true},
                {name: "createdAt", type: "datetime"},
                {name: "updatedAt", type: "datetime"},
                {name: "isActive", type: "boolean"},
                {name: "address", type: "Object", typeName: "ResourceAddress"},
                {name: "protocols", type: "Object", typeName: "ResourceProtocols"},
                {name: "remoteNetwork", type: "Node", typeName: "RemoteNetwork"},
                {name: "groups", type: "Connection", typeName: "Group"}
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
            defaultPageSize: 0
        };

        const {domain, endpoint, defaultRequestOptions, defaultRequestHeaders, onApiError, logger,
            silenceApiErrorsWithResults, defaultPageSize} = Object.assign(defaultOpts, opts);


        this.networkName = networkName;
        this.apiKey = apiKey;
        this.domain = domain;
        this.endpoint = endpoint;
        this.defaultPageSize = defaultPageSize;

        this.defaultRequestOptions = defaultRequestOptions;
        this.defaultRequestHeaders = defaultRequestHeaders;

        this.onApiError = onApiError;
        this.logger = logger;
        this.silenceApiErrorsWithResults = silenceApiErrorsWithResults;
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
        const url = `https://${this.networkName}.${this.domain}/${this.endpoint}`;
        let res = await fetch(url, {
            ...this.defaultRequestOptions,
            headers: {
                ...this.defaultRequestHeaders,
                'X-API-KEY': this.apiKey
            },
            body: JSON.stringify({query, variables})
        });
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
        return `query ${queryName}($id:ID!,$endCursor:String!){${fieldAlias}${field}(id:$id){${connectionField}(${firstResults},after:$endCursor){pageInfo{hasNextPage endCursor}edges{node{${nodeFields}}}}}}`;
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
    getTopLevelKVQuery(queryName, field, key, value, fieldAlias="result", pageSize=0) {
        return this.getRootConnectionPagedQuery(queryName, field, `value:${value} key:${key}`, fieldAlias, pageSize);
    }

    /**
     * Fetches all pages from a query
     * @param query - a Pageable query supporting an `endCursor` variable
     * @param opts - Options - TODO: Documentation
     * @returns {Promise<*>}
     */
    async fetchAllPages(query, opts) {
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

    async _fetchAllNodesOfType(nodeType, opts) {
        const nodeSchema = TwingateApiClient.Schema[nodeType];
        if ( nodeSchema == null) throw new Error(`Cannot find schema for type: ${nodeType}`);
        opts = opts || {};
        opts.fieldSet = opts.fieldSet || [TwingateApiClient.FieldSet.ALL];
        const fieldOpts = opts.fieldOpts || {};

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

        const nodeFields = this._getFields(nodeType, opts.fieldSet, fieldOpts);
        const recordTransformFn = nodeSchema.recordTransformFn;
        const recordTransformOpts = opts.recordTransformOpts || {};
        const allNodesQuery = this.getRootConnectionPagedQuery(`All${nodeType}s`, nodeSchema.queryConnectionField, nodeFields, "result", this.defaultPageSize);
        let records = await this.fetchAllPages(allNodesQuery, {recordTransformFn, recordTransformOpts});


        for ( const record of records ) {
            for ( const connectionField of nodeSchema.connectionFields ) {
                let options = fieldOpts[connectionField];
                if ( record[connectionField] == null ) continue;
                let pageInfo = record[connectionField].pageInfo;
                let pageResults = record[connectionField].edges.map(e=>e.node);
                if ( pageInfo != null && pageInfo.hasNextPage === true ) {
                    pageResults.push(...await this.fetchAllPages(options.nodeQuery, {id: record.id, pageInfo, getResultObjFn: options.getResultObjFn}));
                }
                record[connectionField] = pageResults.map(options.nodeFieldMapFn);
                if ( options.joinConnectionFields != null ) record[connectionField] = record[connectionField].join(options.joinConnectionFields);
            }
        }
        return records;
    }

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
     */
    async addUserToGroup(groupId, userId) {
        let userIds = ( Array.isArray(userId) ? userId : [userId]);
        const groupQuery = "mutation AddUserToGroup($groupId:ID!,$userIds:[ID]){groupUpdate(id:$groupId,addedUserIds:$userIds){ok error}}";
        let groupsResponse = await this.exec(groupQuery, {groupId, userIds} );
        return groupsResponse.entity;
    }

    /**
     * Removes a userId or list of userIds from a Group
     * @param {string} groupId - Twingate Group Id
     * @param {string|string[]} userId - userId or userIds to remove
     * @returns {Promise<*>} - GraphQL entity
     */
    async removeUserFromGroup(groupId, userId) {
        let userIds = ( Array.isArray(userId) ? userId : [userId]);
        const groupQuery = "mutation RemoveUserFromGroup($groupId:ID!,$userIds:[ID]){groupUpdate(id:$groupId,removedUserIds:$userIds){ok error}}";
        let groupsResponse = await this.exec(groupQuery, {groupId, userIds} );
        return groupsResponse.entity;
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


    async createGroup(name, resourceIds, userIds) {
        const createGroupQuery = "mutation CreateGroup($name:String!,$resourceIds:[ID],$userIds:[ID]){result:groupCreate(name:$name,resourceIds:$resourceIds,userIds:$userIds){entity{id}}}";
        let groupsResponse = await this.exec(createGroupQuery, {name, resourceIds, userIds} );
        return groupsResponse.result.entity;
    }

    async createRemoteNetwork(name) {
        const createRemoteNetworkQuery = "mutation CreateRemoteNetwork($name:String!){result:remoteNetworkCreate(name:$name){entity{id}}}";
        let createRemoteNetworkResponse = await this.exec(createRemoteNetworkQuery, {name} );
        return createRemoteNetworkResponse.result.entity;
    }

    async createResource(name, address, remoteNetworkId, protocols = null, groupIds = []) {
        const createResourceQuery = "mutation CreateResource($name:String!,$address:String!,$remoteNetworkId:ID!,$protocols:ProtocolsInput,$groupIds:[ID]){result:resourceCreate(address:$address,groupIds:$groupIds,name:$name,protocols:$protocols,remoteNetworkId:$remoteNetworkId){entity{id}}}";
        let createResourceResponse = await this.exec(createResourceQuery, {name, address, remoteNetworkId, protocols, groupIds} );
        return createResourceResponse.result.entity;
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
