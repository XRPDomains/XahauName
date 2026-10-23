import { XahauNameError } from './errors';
import type { HookExecutionResult, HookHandler, SignAndSubmitResult, SubmitOptions, TxResult } from './types';
export function decodeExecutions(meta: unknown): HookExecutionResult[] {
    const rows = (meta as {
        HookExecutions?: unknown[];
    } | null)?.HookExecutions ?? [];
    if (!Array.isArray(rows))
        throw new XahauNameError('Invalid HookExecutions', 'BAD_METADATA');
    return rows.map(row => {
        const e = ((row as {
            HookExecution?: unknown;
        })?.HookExecution ?? row) as Record<string, unknown>;
        const code = String(e.HookReturnCode ?? '');
        const text = String(e.HookReturnString ?? '');
        if (!/^[0-9a-f]{1,16}$/i.test(code) || !/^(?:[0-9a-f]{2})*$/i.test(text))
            throw new XahauNameError('Invalid hook result encoding', 'BAD_METADATA');
        return {
            account: String(e.HookAccount ?? ''), hash: String(e.HookHash ?? ''), result: Number(e.HookResult), flags: Number(e.Flags ?? 0), returnCode: BigInt('0x' + code).toString(), returnString: Buffer.from(text, 'hex').toString('utf8').replace(/\0+$/, ''), raw: e
        };
    });
}
export function transactionResult(result: SignAndSubmitResult, treasury: string, expected: SubmitOptions, hashes: Partial<Record<HookHandler, string>> = {}): TxResult {
    const executions = decodeExecutions(result.meta), relevant = executions.filter(e => e.account === treasury), details = { ...result, hookExecutions: executions };
    if (result.validated !== true)
        throw new XahauNameError('Transaction is not validated', 'NOT_VALIDATED', details);
    const failed = relevant.find(e => e.result !== 3 || e.returnCode !== '0');
    if (failed) {
        const failure = {
            handler: Object.entries(hashes).find(([, hash]) => hash === failed.hash)?.[0],
            expectedHandler: expected.handler,
            hookHash: failed.hash,
            executionIndex: (failed.raw as Record<string, unknown>).HookExecutionIndex,
            returnCode: failed.returnCode,
            returnString: failed.returnString,
        };
        const failureDetails = {...details, failure};
        const code = BigInt(failed.returnCode);
        if (code <= BigInt(Number.MAX_SAFE_INTEGER))
            throw XahauNameError.fromHookResult(Number(code), failed.returnString, failureDetails);
        throw new XahauNameError('Hook failed: ' + failed.returnString, failed.returnCode, failureDetails);
    }
    if (result.engineResult !== 'tesSUCCESS')
        throw XahauNameError.fromEngineResult(result.engineResult, details);
    const execution = relevant.find(e => (!hashes[expected.handler] || e.hash === hashes[expected.handler]) && expected.returns.includes(e.returnString));
    if (!execution)
        throw new XahauNameError('Expected ' + expected.handler + ' acknowledgement missing; operation may be pass-through or unfinished', 'HOOK_NOT_EXECUTED', details);
    return {
        txHash: result.txHash, engineResult: result.engineResult, hookReturnCode: 0, hookReturnString: execution.returnString, status: expected.status ?? 'applied', hookExecutions: executions, rawMeta: result.meta
    };
}
