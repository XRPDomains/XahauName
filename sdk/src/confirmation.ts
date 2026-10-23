type Rpc = {request(request: any): Promise<any>};
export async function waitValidated(rpc: Rpc, hash: string, options: {timeoutMs?: number; intervalMs?: number} = {}) {
    if (!/^[A-Fa-f0-9]{64}$/.test(hash)) throw new Error('The wallet did not return a valid transaction hash.');
    const until = Date.now() + (options.timeoutMs ?? 90000);
    while (Date.now() < until) {
        try {
            const r = (await rpc.request({command:'tx',transaction:hash,binary:false})).result;
            if (r.validated === true && typeof r.meta === 'object') return r;
        } catch(e: any) {
            if (!['txnNotFound','notFound'].includes(e.data?.error) && !/connection|websocket|timeout/i.test(e.message)) throw e;
        }
        await new Promise(resolve => setTimeout(resolve, options.intervalMs ?? 1500));
    }
    throw Object.assign(new Error('Transaction confirmation is still unknown. Check the hash before trying again; do not automatically resubmit.'),{txHash:hash});
}
