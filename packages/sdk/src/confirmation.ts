type Rpc = {request(request: any): Promise<any>};
import {isTransientRpcError} from './errors';
import {beforeDeadline,positiveMilliseconds,waitDelay} from './deadline';
export async function waitValidated(rpc: Rpc, hash: string, options: {timeoutMs?: number; intervalMs?: number;signal?:AbortSignal} = {}) {
    if (!/^[A-Fa-f0-9]{64}$/.test(hash)) throw new Error('The wallet did not return a valid transaction hash.');
    const until = Date.now() + positiveMilliseconds(options.timeoutMs??90000,'confirmation timeout');
    const interval=positiveMilliseconds(options.intervalMs??1500,'confirmation interval');
    const unknown=(cause?:unknown)=>Object.assign(new Error('Transaction confirmation is still unknown. Check the hash before trying again; do not automatically resubmit.'),{txHash:hash,cause,code:(cause as any)?.code??'TIMEOUT'});
    while (Date.now() < until) {
        try {
            const r = (await beforeDeadline(()=>rpc.request({command:'tx',transaction:hash,binary:false}),until,options.signal)).result;
            if (r.validated === true && r.meta && typeof r.meta === 'object') return r;
        } catch(e: any) {
            if(['TIMEOUT','ABORTED'].includes(e.code))throw unknown(e);
            if (!['txnNotFound','notFound'].includes(e.data?.error) && !isTransientRpcError(e)) {
                throw Object.assign(new Error(e.message??'Could not read transaction confirmation.'),{txHash:hash,cause:e,code:e.code});
            }
        }
        try{await waitDelay(Math.min(interval,Math.max(0,until-Date.now())),options.signal);}catch(e){throw unknown(e);}
    }
    throw unknown();
}
