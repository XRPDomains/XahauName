/**
 * @xahauname/sdk — Error class
 */

import { ReturnCode, RC_NAMES } from './constants';

/** Read retries only; never authorizes resubmitting a transaction. */
export function isTransientRpcError(error:unknown):boolean {
    if(!error||typeof error!=='object')return false;
    const e=error as {code?:unknown;name?:string;message?:string};
    if(e.code!==undefined&&e.code!=='UNKNOWN_ERROR')return e.code==='RPC_CONNECTION_FAILED'||['ECONNRESET','ETIMEDOUT','ECONNREFUSED'].includes(String(e.code));
    return ['ConnectionError','NotConnectedError','DisconnectedError','TimeoutError'].includes(e.name??'')||/You need to be connected to a ledger|connect\(\).*timed out|websocket|connection (closed|failed|lost|not open)|Timeout for request|socket (closed|hang up)/i.test(e.message??'');
}

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
