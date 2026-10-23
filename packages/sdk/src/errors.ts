/**
 * @xahauname/sdk — Error class
 */

import { ReturnCode, RC_NAMES } from './constants';

export class XahauNameError extends Error {
    code?: ReturnCode | string;
    details?: unknown;

    constructor(message: string, code?: ReturnCode | string, details?: unknown) {
        super(message);
        this.name = 'XahauNameError';
        this.code = code;
        this.details = details;
    }

    static fromHookResult(returnCode: number, returnString: string, meta?: unknown): XahauNameError {
        const name = RC_NAMES[returnCode] ?? `RC_${returnCode}`;
        return new XahauNameError(
            `Hook returned ${name}: ${returnString}`,
            returnCode,
            meta,
        );
    }

    static fromEngineResult(engineResult: string, meta?: unknown): XahauNameError {
        return new XahauNameError(
            `Tx engine result: ${engineResult}`,
            engineResult,
            meta,
        );
    }
}
