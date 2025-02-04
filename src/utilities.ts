import * as wot from "wot-typescript-definitions"
import * as Generator from "./Generator"
var fs = require("fs")
var mkdirp = require("mkdirp")
var jsf = require("json-schema-faker")
var util = require("util")
var ajValidator = require("ajv")
var logFile = fs.createWriteStream("debug.log", { flags: "w" })
var logStdout = process.stdout

console.log = function () {
    logFile.write(util.format.apply(null, arguments) + "\n")
    logStdout.write(util.format.apply(null, arguments) + "\n")
}

/**
 * Logs a formatted message. Per default "* " is added as prefix and the color of the logged message is blue.
 * @param message The message to log.
 * @param prefix The prefix of the logged message.
 * @param color The color of the logged message.
 */
export function logFormatted(message: string, prefix: string = "* ", color: string = "\x1b[36m%s\x1b[0m"): void {
    console.log(color, prefix + message)
}

/**
 * A test config file is always configured like this.
 */
export interface testConfig {
    TBname?: string
    http?: {
        port?: number
        allowSelfSigned: boolean
    }
    coap?: {
        port?: number
    }
    SchemaLocation?: string
    TestReportsLocation?: string
    TestDataLocation?: string
    TimeBetweenRequests?: number
    ActionTimeout?: number
    Scenarios?: number
    Repetitions?: number
    EventAndObservePOptions: {
        Asynchronous: {
            // How many Data Packages the testbench will be receiving. Set to null for unlimited amount.
            MaxAmountRecvData: number
            // MilliSeconds the testbench stays subscribed/observes and Event/Property during second Phase (if data package cap is not hit before).
            MsListen: number
            // MilliSeconds until the testbench times out during subscription.
            MsSubscribeTimeout: number
        }
        Synchronous: {
            // If false the testbench will skip the second (synchronous) listening phase.
            isEnabled: boolean
            // How many Data Packages the testbench will be receiving. Set to null for unlimited amount.
            MaxAmountRecvData: number
            // MilliSeconds the testbench stays subscribed/observes and Event/Property during second Phase (if data package cap is not hit before).
            MsListen: number
            // MilliSeconds until the testbench times out during subscription.
            MsSubscribeTimeout: number
        }
    }
    credentials?: any
}

// -------------------------- Control Logic Enums ---------------------------------
/**
 * An enum defining the listening type of an observeProperty or event test.
 */
export enum ListeningType {
    Asynchronous = 1,
    Synchronous = 2,
}

/**
 * An enum defining the type of an interaction.
 */
export enum InteractionType {
    Property = "Property",
    Action = "Action",
    Event = "Event",
}

/**
 * An enum defining the type of an interaction schema.
 */
export enum SchemaType {
    Property = "Property",
    Action = "Action",
    EventSubscription = "EventSubscription",
    EventData = "EventData",
    EventCancellation = "EventCancellation",
}

// -------------------------- FAKE DATA GENERATION ---------------------------------
export class CodeGenerator {
    private td: wot.ThingDescription
    public requests: any
    //public input_types: Array <any>
    public input_types: Object
    constructor(tdesc: wot.ThingDescription, testConf: any) {
        this.td = tdesc
        //Toggle between the two Generator types to change the generation of testdata
        //this.generateFakeData(testConf, tdesc)

        this.input_types = this.generateFakeHeuristicData(testConf, tdesc)

        this.requests = this.getRequests(testConf.TestDataLocation) 
    }
    private createRequest(requestName: string, loc: string, pat: string): JSON {
        try {
            let scheme = JSON.parse(fs.readFileSync(loc + "Requests/" + requestName + "-" + pat + ".json", "utf8"))
            return jsf.generate(scheme)
        } catch (Error) {
            return null
        }
    }

    // generates fake data and stores it to config TestDataLocation location
    public generateFakeData(testConf: any, tdesc: wot.ThingDescription) {
        // create interaction list: no optimized solution: -----------
        var requests = {
            [SchemaType.Property]: {},
            [SchemaType.Action]: {},
            [SchemaType.EventSubscription]: {},
            [SchemaType.EventCancellation]: {},
        }

        for (let property in tdesc.properties) {
            requests[SchemaType.Property][property] = []
            for (let scenario = 0; scenario < testConf.Scenarios; scenario++) {
                requests[SchemaType.Property][property].push(this.createRequest(property, testConf.SchemaLocation, SchemaType.Property))
            }
        }

        for (let action in tdesc.actions) {
            requests[SchemaType.Action][action] = []
            for (let scenario = 0; scenario < testConf.Scenarios; scenario++) {
                requests[SchemaType.Action][action].push(this.createRequest(action, testConf.SchemaLocation, SchemaType.Action))
            }
        }

        for (let event in tdesc.events) {
            requests[SchemaType.EventSubscription][event] = []
            requests[SchemaType.EventCancellation][event] = []
            for (let scenario = 0; scenario < testConf.Scenarios; scenario++) {
                requests[SchemaType.EventSubscription][event].push(this.createRequest(event, testConf.SchemaLocation, SchemaType.EventSubscription))
                requests[SchemaType.EventCancellation][event].push(this.createRequest(event, testConf.SchemaLocation, SchemaType.EventCancellation))
            }
        }

        fs.writeFileSync(testConf.TestDataLocation, JSON.stringify(requests, null, " "))
    }

    public generateFakeHeuristicData(testConf: any, tdesc: wot.ThingDescription) {

        // create interaction list: no optimized solution: -----------
        var requests = {
            [SchemaType.Property]: {},
            [SchemaType.Action]: {},
            [SchemaType.EventSubscription]: {},
            [SchemaType.EventCancellation]: {},
        }
        var types = {
            [SchemaType.Property]: {},
            [SchemaType.Action]: {},
            [SchemaType.EventSubscription]: {},
            [SchemaType.EventCancellation]: {},
        }
        
        for (let property in tdesc.properties) {
            requests[SchemaType.Property][property] = []
            types[SchemaType.Property][property] = []
            if (!tdesc.properties[property].readOnly) {
                // START here with sensible data generation
                let [array_prop, data_type] = Generator.fuzzGenerator(tdesc,tdesc.properties, property)
                
                array_prop.forEach(element => {
                    requests[SchemaType.Property][property].push(element);
                })
                
                
                data_type.forEach(element => {
                    types[SchemaType.Property][property].push(element);
                })
            }
        }

        for (let action in tdesc.actions) {
            requests[SchemaType.Action][action] = []
            types[SchemaType.Action][action] = []
            if (tdesc.actions[action].input) {
                
                let [array_act, data_type] = Generator.fuzzGenerator(tdesc,tdesc.actions, action)
                
                array_act.forEach(element => {
                    requests[SchemaType.Action][action].push(element);
                })
                data_type.forEach(element => {
                    types[SchemaType.Action][action].push(element);
                })
            }
        }

        for (let event in tdesc.events) {
            requests[SchemaType.EventSubscription][event] = []
            requests[SchemaType.EventCancellation][event] = []
            for (let scenario = 0; scenario < testConf.Scenarios; scenario++) {
                requests[SchemaType.EventSubscription][event].push(this.createRequest(event, testConf.SchemaLocation, SchemaType.EventSubscription))
                requests[SchemaType.EventCancellation][event].push(this.createRequest(event, testConf.SchemaLocation, SchemaType.EventCancellation))
            }
        }

        fs.writeFileSync(testConf.TestDataLocation, JSON.stringify(requests, null, " "))
        return types
    }
    // helper function finds created data:
    public findRequestValue(requestsLoc, testScenario, schemaType: SchemaType, interactionName: string) {
        let requests = JSON.parse(fs.readFileSync(requestsLoc, "utf8"))
        return requests[schemaType][interactionName][testScenario]
    }
    public getRequests(requestsLoc) {
        return JSON.parse(fs.readFileSync(requestsLoc, "utf8"))
    }
}

// ------------------------ SCHEMA VALIDATION -----------------------------------
var ajv = new ajValidator({ allErrors: true })
export function validateRequest(requestName: string, request: JSON, schemaLoc: string, schemaType: SchemaType): Array<any> {
    let reqSchema: any = fs.readFileSync(schemaLoc + "Requests/" + requestName + "-" + schemaType + ".json", "utf8")
    ajv.validate(JSON.parse(reqSchema), request)
    return ajv.errors
}

export function validateResponse(responseName: string, response: JSON, schemaLoc: string, schemaType: SchemaType): Array<any> {
    let resSchema: any = fs.readFileSync(schemaLoc + "Responses/" + responseName + "-" + schemaType + ".json", "utf8")
    ajv.validate(JSON.parse(resSchema), response)
    return ajv.errors
}

// ------------------------ SCHEMA GENERATION ------------------------------------

/**
 * Writes extracted schema to a file.
 * @param name The name of an interaction.
 * @param dataSchema The schema to write.
 * @param schemaLocation The file location where the schema will be saved.
 * @param schemaType The type of the schema.
 */
function writeSchema(name, dataSchema, schemaLocation, schemaType: SchemaType) {
    let schema: string = '{\n\t"name":"' + name + '",\n\t' + dataSchema + "\n\t}"
    let writeLoc: string = schemaLocation + name + "-" + schemaType + ".json"
    fs.writeFileSync(writeLoc, schema)
}

/**
 * Generates schemas for all interactions.
 * @param td The ThingDescription to generate from.
 * @param schemaLocation The file location where the generated schemas will be saved.
 * @param logMode True if logMode is enabled, false otherwise.
 */
export function generateSchemas(td: wot.ThingDescription, schemaLocation: string, logMode: boolean): number {
    let schemaLocationReq = schemaLocation + "Requests/"
    let schemaLocationResp = schemaLocation + "Responses/"
    let reqSchemaCount: number = 0
    let resSchemaCount: number = 0
    mkdirp.sync(schemaLocationReq)
    mkdirp.sync(schemaLocationResp)

    // Property schemas:
    for (var key in td.properties) {
        if (td.properties.hasOwnProperty(key)) {
            // checks if writable:
            if (!td.properties[key].readOnly) {
                // create request schema:
                let dataSchema = JSON.stringify(td.properties[key]).slice(0, -1).substring(1)
                writeSchema(key, dataSchema, schemaLocationReq, SchemaType.Property)
                reqSchemaCount++
                // response schema:
                writeSchema(key, dataSchema, schemaLocationResp, SchemaType.Property)
                resSchemaCount++
            } else {
                // create response schema:
                let dataSchema = JSON.stringify(td.properties[key]).slice(0, -1).substring(1)
                writeSchema(key, dataSchema, schemaLocationResp, SchemaType.Property)
                resSchemaCount++
            }
        }
    }

    // Action schemas:
    for (var key in td.actions) {
        if (td.actions.hasOwnProperty(key)) {
            if (td.actions[key].hasOwnProperty("input")) {
                // create request schema:
                let dataSchema = writeSchema(key, JSON.stringify(td.actions[key].input).slice(0, -1).substring(1), schemaLocationReq, SchemaType.Action)
                reqSchemaCount++
            }
            if (td.actions[key].hasOwnProperty("output")) {
                // create response schema:
                writeSchema(key, JSON.stringify(td.actions[key].output).slice(0, -1).substring(1), schemaLocationResp, SchemaType.Action)
                resSchemaCount++
            }
        }
    }

    // Event schemas:
    for (var key in td.events) {
        if (td.events.hasOwnProperty(key)) {
            if (td.events[key].hasOwnProperty("subscription")) {
                writeSchema(key, JSON.stringify(td.events[key].subscription).slice(0, -1).substring(1), schemaLocationReq, SchemaType.EventSubscription)
                reqSchemaCount++
                // Potential resSchema for subscription should be generated here. Perhaps something like this:
                // if (td.events[key].subscription.hasOwnProperty("properties")) {
                //     if (td.events[key].subscription.properties.hasOwnProperty("subscriptionID")) {
                //         writeSchema(
                //             key, JSON.stringify(td.events[key].subscription.properties.subscriptionID).slice(0, -1).substring(1),
                //             schemaLocationResp, "SubscribeEvent"
                //         )
                //     }
                // }
                // resSchemaCount++
            }
            if (td.events[key].hasOwnProperty("data")) {
                writeSchema(key, JSON.stringify(td.events[key].data).slice(0, -1).substring(1), schemaLocationResp, SchemaType.EventData)
                resSchemaCount++
            }
            if (td.events[key].hasOwnProperty("cancellation")) {
                writeSchema(key, JSON.stringify(td.events[key].cancellation).slice(0, -1).substring(1), schemaLocationReq, SchemaType.EventCancellation)
                reqSchemaCount++
                // Potential resSchema for cancellation should be generated here
            }
        }
    }

    if (logMode) console.log("\x1b[36m%s%s\x1b[0m", "* ", reqSchemaCount + " request schemas and " + resSchemaCount + " response schemas have been created")
    if (reqSchemaCount == 0 && resSchemaCount == 0) {
        if (logMode) console.log("\x1b[36m%s%s\x1b[0m", "* !!! WARNING !!! NO INTERACTIONS FOUND")
        return 1
    }
    return 0
}

// --------------------------- UTILITY FUNCTIONS -------------------------------------
/**
 * Returns the interaction object corresponding to the interaction name.
 * @param td The Thing description.
 * @param name The name of the interaction.
 */
export function getInteractionByName(td: wot.ThingDescription, interactionType: InteractionType, name: string): [any] {
    if (interactionType == InteractionType.Property) var interactionList = Object.keys(td.properties)
    else if (interactionType == InteractionType.Action) var interactionList = Object.keys(td.actions)
    else if (interactionType == InteractionType.Event) var interactionList = Object.keys(td.events)

    if (interactionList.includes(name)) {
        if (interactionType == InteractionType.Property) return td.properties[name]
        else if (interactionType == InteractionType.Action) return td.actions[name]
        else if (interactionType == InteractionType.Event) return td.events[name]
    }
}

/**
 * Returns an wrapped Promise that races between the provided promise and an internal timeout.
 * @param ms The number indicating the length of the internal timeout in ms.
 * @param promise The promise the timeout shall race against.
 */
export function promiseTimeout(ms: number, promise: Promise<any>) {
    // Create a promise that rejects in <ms> milliseconds
    let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            // clearTimeout(id);
            reject("Timed out in " + ms + "ms.")
        }, ms)
    })
    // Returns a race between our timeout and the passed in promise
    return Promise.race([promise, timeout])
}

/**
 * Sleeps the specified amount of time.
 * @param ms The number indicating the time to sleep in ms.
 */
export function sleepInMs(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A deferred promise object that can be resolved and rejected from another function. 
 */
export class DeferredPromise {
    resolve
    reject
    _promise
    then
    catch
    constructor() {
        this._promise = new Promise((resolve, reject) => {
            // assign the resolve and reject functions to "this" making them usable on the class instance
            this.resolve = resolve
            this.reject = reject
        })
        // bind "then" and "catch" to implement the same interface as Promise
        this.then = this._promise.then.bind(this._promise)
        this.catch = this._promise.catch.bind(this._promise)
        this[Symbol.toStringTag] = "Promise"
    }
}


/**
 * Returns object with specific number of testcases for each interaction affordance 
 * @param testConf The testConfig
 * @param interactionType The type of Interaction 
 */
export function getNumberElements (testConf: any, interactionType: any){
    try {
        let fake_data = JSON.parse(fs.readFileSync(testConf.TestDataLocation, "utf8"));
        let fake_property = fake_data[interactionType]

        var countObj = new Object();

        for (let prop in fake_property){
            var count = fake_property[prop].length;
            countObj[prop] = count;
        }
        
        return countObj;
    }
    catch (Error) {
        return null;
    }
}

/**
 * Rteurns the test Data generated in the initiation stage 
 * @param testConf The testConfig
 */
export function getTestData(testConf: any){
    let requests_m = JSON.parse(fs.readFileSync(testConf.TestDataLocation, "utf8"));
    return requests_m
}
/**
 * Returns a valid request input for a given schema 
 * @param schema current interaction schema
 */
export function createValidInput(schema){ 
    return jsf.generate(schema)
}

export function removeDuplicates(array: Array <any>){
    return array.filter((value:any,index:any)=> array.indexOf(value)=== index)
}
export function getCurrentTime(){
    let unix_timestamp = Date.now();
    var date = new Date(unix_timestamp);
    // Hours part from the timestamp
    var hours = date.getHours();
    // Minutes part from the timestamp
    var minutes = "0" + date.getMinutes();
    // Seconds part from the timestamp
    var seconds = "0" + date.getSeconds();
    var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

    return formattedTime
}
/**
 * Creates a object with the necessary information about a single test instance 
 * @param result Human readable explaination of test result
 * @param interaction_type Type of interaction determines the layout of the mini report
 * @param interaction_name name of the interaction
 * @param pass test passed the requirement true/false
 * @param payload input that was send as payload of a request
 * @param response response of the system under test
 */
export function createMiniReport(result: string,interaction_type: string, interaction_name: string, pass: boolean, payload: any, response?: any){
    let mini_report : any = {}

    let unix_timestamp = Date.now();
    var date = new Date(unix_timestamp);
    // Hours part from the timestamp
    var hours = date.getHours();
    // Minutes part from the timestamp
    var minutes = "0" + date.getMinutes();
    // Seconds part from the timestamp
    var seconds = "0" + date.getSeconds();
    var formattedTime = hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);

    if (interaction_type == "write"){
        mini_report = {
            "name": interaction_name,
            "passed": pass,
            "time": formattedTime,
            "writeInteraction":{
                "payload": payload,
                "result": result
            }
        }
    }
    if (interaction_type == "read"){
        mini_report = {
            "name": interaction_name,
            "passed": pass,
            "time": formattedTime,
            "readInteraction":{
                "response": response,
                "result": result
            }
        }
    }
    if (interaction_type == "act"){
        mini_report = {
            "name": interaction_name,
            "passed": pass,
            "time": formattedTime,
            "actionInteraction":{
                "payload": payload,
                "response": response,
                "result": result
            }
        }
    }
    if (interaction_type == "eve"){
        mini_report = {
            "name": interaction_name,
            "passed": pass,
            "time": formattedTime,
            "eventInteraction":{
                "payload": payload,
                "response": response,
                "result": result
            }
        }
    }
    return mini_report
}

export function createT3MiniReport(payload: any, interaction_type: string){
    let mini_T3_report : any = {}

    if(interaction_type == "property"){
        mini_T3_report = {
            "passed": undefined,
            "time": undefined,
            "payload": payload,
            "result": undefined
        }
    }
    if(interaction_type == "action"){
        mini_T3_report = {
            "passed": undefined,
            "time": undefined,
            "payload": payload,
            "response": undefined,
            "result": undefined
        }
    }

    return mini_T3_report
}

export function createT3Report(data, type){
    let initT3 = {}

    let prop_data = data[Object.keys(data)[0]]
    let act_data = data[Object.keys(data)[1]]
    let prop_type = type[Object.keys(type)[0]]
    let act_type = type[Object.keys(type)[1]]

    let prop_keys = Object.keys(data[Object.keys(data)[0]])
    let act_keys = Object.keys(data[Object.keys(data)[1]])


    for(var key of prop_keys){
        initT3[key] = {}

        let special_types = removeDuplicates(prop_type[key])
        for(var i = 0; i < special_types.length; i++){
            initT3[key][special_types[i]] = []
        }
        //check if array is empty
        var length = prop_data[key].length
        if(length != 0){
            
            for(var i = 0; i < length; i++){
                //create individual blank reports and push them into the respective type arrays
                let mini_report = createT3MiniReport(prop_data[key][i],"property")
                //initT3[key].push([prop_data[key][i],prop_type[key][i]])
                initT3[key][prop_type[key][i]].push(mini_report)
            }
            
        }
    }
    
    for(var key of act_keys){
        initT3[key] = {}
        let special_types = removeDuplicates(act_type[key]) 
        for(var i = 0; i < special_types.length; i++){
            initT3[key][special_types[i]] = []
        }
        //check if array is empty
        var length = act_data[key].length
        if(length != 0){
        
            for(var i = 0; i < length; i++){
                //create individual blank reports and push them into the respective type arrays
                let mini_report = createT3MiniReport(act_data[key][i],"action")
                initT3[key][act_type[key][i]].push(mini_report)
            }
            
        }
    }
    
    return initT3
}

export function countResults(miniReport: Array<any>){
    var length: number = miniReport.length;
    var passed: number = 0;
    for(var i = 0; i < length; i++){
        if(miniReport[i].passed){
            passed = passed +1;
        }
    }

    return [passed,length];
}

export function countResultsT3(miniReportT3: object){
    var number_properties: number = Object.keys(miniReportT3).length
    
    var passed: number = 0;
    var length: number = 0;
    for(var j = 0; j < number_properties; j++){
        
        var number_scenarios = Object.keys(Object.values(miniReportT3)[j]).length

        for(var i = 0; i< number_scenarios; i++){
            var testcases : any = Object.values(Object.values(Object.values(miniReportT3)[j]))[i]
            var number_testcases: number = testcases.length
            for(var k = 0; k < number_testcases; k++){
                if(testcases[k].passed){
                    passed = passed +1;
                }
                length = length +1;
            }
        }
    }
    
    return [passed,length];
}