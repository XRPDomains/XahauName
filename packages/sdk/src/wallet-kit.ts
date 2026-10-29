import type {TxSigner,SignAndSubmitResult} from './types';
import {waitValidated} from './confirmation';
import {isTransientRpcError} from './errors';
export interface WalletKitSession {
    getAccount():{address:string;network?:string|{id?:string}}|null;
    getNetwork():{id?:string}|null;
    signAndSubmit(request:{txJson:Record<string,unknown>;maxFeeDrops?:string}):Promise<{hash?:string}>;
}
export interface WalletKitSignerOptions {
    network:string;
    networkId:number;
    maxFeeDrops?:string;
    /** Use wallet-kit only with a manager that enforces the request's maxFeeDrops. Default: sdk. */
    feePreparation?:'sdk'|'wallet-kit';
    /** Durable intent gate, called immediately before dispatching to the wallet manager. Throw to abort. */
    onSigning?:()=>void;
    onSubmitted?:(hash:string)=>void;
    onValidated?:(result:SignAndSubmitResult)=>void;
}
type Rpc={request(request:any):Promise<any>;autofill?:(tx:any)=>Promise<any>};
/** Kit transport: retry one transient read failure, never a submit or signing request. */
export function createWalletKitRpcTransport(rpc:Rpc,ready:()=>Promise<void>,networkId:string){
    const reads=new Set(['server_info','account_info','fee','ledger','ledger_entry','tx','ping']);
    return async(network:{id:string},method:string,params:Record<string,unknown>,signal?:AbortSignal):Promise<Record<string,any>>=>{
        if(network.id!==networkId)throw new Error('Wallet network does not match the configured deployment.');
        for(let attempt=0;;attempt++){
            signal?.throwIfAborted();
            try{await ready();signal?.throwIfAborted();const result=await rpc.request({...params,command:method});signal?.throwIfAborted();return result.result;}
            catch(error){if(attempt>0||!reads.has(method)||!isTransientRpcError(error)||signal?.aborted)throw error;}
        }
    };
}
export function assertWalletKitSession(manager:Pick<WalletKitSession,'getAccount'|'getNetwork'>,network:string,address?:string){
    const account=manager.getAccount(),selected=manager.getNetwork();
    const reported=typeof account?.network==='string'?account.network:account?.network?.id;
    if(!account||(address&&account.address!==address))throw new Error('Your wallet account has changed. Reconnect before signing.');
    if(selected?.id!==network||(reported&&reported!==network))throw new Error('Switch your wallet to '+network+' before signing.');
    return account.address;
}
function canonical(value:any):string {
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
    return JSON.stringify(value);
}
/** Structural integration: no dependency on Wallet Kit internals or browser providers. */
export function createWalletKitSigner(manager:WalletKitSession,rpc:Rpc,options:WalletKitSignerOptions):TxSigner {
    const address=assertWalletKitSession(manager,options.network),max=options.maxFeeDrops??'1000000';
    if(!/^\d+$/.test(max)||!Number.isSafeInteger(options.networkId))throw new Error('Invalid wallet signer configuration.');
    if(options.feePreparation!==undefined&&!['sdk','wallet-kit'].includes(options.feePreparation))throw new Error('Invalid fee preparation mode.');
    return {address,async signAndSubmit(tx):Promise<SignAndSubmitResult>{
        assertWalletKitSession(manager,options.network,address);
        if(tx.NetworkID!==undefined&&tx.NetworkID!==options.networkId)throw new Error('Incorrect NetworkID.');
        if(tx.Account!==undefined&&tx.Account!==address)throw new Error('Incorrect signing account.');
        if(tx.Fee!==undefined&&(!/^\d+$/.test(String(tx.Fee))||BigInt(String(tx.Fee))>BigInt(max)))throw new Error('The fee exceeds the configured limit.');
        // Resolve wallet-populated fees before asking for a signature. A request-only
        // transport must supply an explicit Fee; unknown fees fail closed.
        const requested:Record<string,unknown>=structuredClone({...tx,Account:address,NetworkID:options.networkId});
        const prepared=tx.Fee===undefined&&options.feePreparation!=='wallet-kit'
            ? await (rpc.autofill ? rpc.autofill(structuredClone(requested)) : Promise.reject(new Error('Fee unavailable. Supply Fee or a client with autofill before signing.')))
            : requested;
        if((prepared.Fee===undefined&&options.feePreparation!=='wallet-kit')||(prepared.Fee!==undefined&&(typeof prepared.Fee!=='string'||!/^\d+$/.test(prepared.Fee)||BigInt(prepared.Fee)>BigInt(max))))throw new Error('The fee exceeds the configured limit.');
        for(const key of Object.keys(requested))if(canonical(prepared[key])!==canonical(requested[key]))throw new Error('Fee preparation changed the transaction request.');
        assertWalletKitSession(manager,options.network,address);
        // Autofill estimates the fee, not the wallet's signing context. Forward only
        // the caller's intent plus that fee: Kit owns missing Sequence, Flags and
        // expiry, including queued-account handling and bounded expiry extensions.
        // Explicit caller values remain exact in both the request and receipt.
        const intent:Record<string,unknown>=structuredClone({...requested,...(prepared.Fee===undefined?{}:{Fee:prepared.Fee})});
        options.onSigning?.();
        const result=await manager.signAndSubmit({txJson:structuredClone(intent),maxFeeDrops:max}),hash=result.hash;
        if(!hash||!/^[A-Fa-f0-9]{64}$/.test(hash))throw new Error('No transaction hash was returned. Check your wallet history before resubmitting.');
        try{options.onSubmitted?.(hash);}catch{/* Observers must not interrupt receipt verification. */}
        const receipt=await waitValidated(rpc,hash),actual=receipt.tx_json??receipt;
        const mismatch=()=>Object.assign(new Error('The signed transaction does not match the request.'),{txHash:hash});
        if(typeof actual.Fee!=='string'||!/^\d+$/.test(actual.Fee)||BigInt(actual.Fee)>BigInt(max))throw mismatch();
        if(actual.Account!==address||actual.NetworkID!==options.networkId||actual.TransactionType!==tx.TransactionType)throw mismatch();
        for(const key of Object.keys(intent)){
            if(canonical(actual[key])!==canonical(intent[key]))throw mismatch();
        }
        const validated={txHash:hash,engineResult:receipt.meta.TransactionResult,meta:receipt.meta,validated:true};
        try{options.onValidated?.(validated);}catch{/* UI observers cannot change a validated result. */}
        return validated;
    }};
}
