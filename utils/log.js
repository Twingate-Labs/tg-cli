import * as Colors from "https://deno.land/std/fmt/colors.ts";


const LOG_LEVELS = {
    "TRACE": 8,
    "DEBUG": 7,
    "INFO": 6,
    "WARN": 5,
    "ERROR": 4,
    "SEVERE": 3,
    "FATAL": 2,
    "QUIET": 1,
    "SILENT": 0
}

const log_level = LOG_LEVELS[Deno.env.get("LOG_LEVEL") || "INFO"];

export class Logger {
    info(msg) {
        if ( log_level >= LOG_LEVELS.INFO ) console.info(`${Colors.blue("[INFO]   ")} ${msg}`);
    }

    warn(msg, ...data) {
        if ( log_level >= LOG_LEVELS.WARN ) console.warn(`${Colors.yellow("[WARN]   ")} ${msg}`);
    }

    error(msg) {
        if ( log_level >= LOG_LEVELS.ERROR ) console.error(`${Colors.red("[ERROR]  ")} ${msg}`);
    }

    exception(e) {
        if ( log_level >= LOG_LEVELS.ERROR ) console.error(`${Colors.red("[ERROR]  ")} Exception: ${e.stack||e}`);
    }

    success(msg) {
        if ( log_level >= LOG_LEVELS.QUIET ) console.log(`${Colors.green("[SUCCESS]")} ${msg}`);
    }

    failure(msg) {
        if ( log_level >= LOG_LEVELS.QUIET ) console.error(`${Colors.red("[FAILURE]")} ${msg}`);
    }

}

export const Log = new Logger()