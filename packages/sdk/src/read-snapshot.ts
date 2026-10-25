import type {ClientContext} from './context';
import type {ReadOptions} from './types';
import {XahauNameError} from './errors';

/** One operation, one immutable ledger. No cross-operation or unpinned caching. */
export function snapshotContext(ctx:ClientContext,ledgerHash:string):ClientContext {
    if(!/^[a-f0-9]{64}$/i.test(ledgerHash))throw new XahauNameError('Invalid snapshot ledger hash','INVALID_ARGUMENT');
    const hash=ledgerHash.toUpperCase(),states=new Map<string,Promise<Buffer|null>>(),objects=new Map<string,Promise<any>>();
    const remember=<T>(map:Map<string,Promise<T>>,key:string,read:()=>Promise<T>)=>{
        let pending=map.get(key);
        if(!pending){
            if(map.size>=4096)map.delete(map.keys().next().value!);
            pending=read();map.set(key,pending);
            const captured=pending;void pending.catch(()=>{if(map.get(key)===captured)map.delete(key);});
        }
        return pending;
    };
    const pin=(options:ReadOptions={})=>{
        if(options.ledgerHash&&options.ledgerHash.toUpperCase()!==hash)throw new XahauNameError('Snapshot ledger mismatch','INVALID_ARGUMENT');
        return{...options,ledgerHash:hash};
    };
    return{...ctx,ledgerHash:async()=>hash,
        readState:async(key,options)=>{const opts=pin(options),k=key.toUpperCase();const value=await remember(states,k,()=>ctx.readState(k,opts));return value?Buffer.from(value):null;},
        ledgerObject:async(key,options)=>{const opts=pin(options),k=key.toUpperCase();return structuredClone(await remember(objects,k,()=>ctx.ledgerObject(k,opts)));},
    };
}

/** Bounded fan-out keeps large portfolios from flooding a public RPC. */
export async function mapReads<T,R>(items:readonly T[],read:(item:T)=>Promise<R>,limit=4):Promise<R[]> {
    const result:R[]=new Array(items.length);let cursor=0;
    await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const i=cursor++;result[i]=await read(items[i]);}}));
    return result;
}
