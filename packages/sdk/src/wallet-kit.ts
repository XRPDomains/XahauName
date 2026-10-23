import type {TxSigner,SignAndSubmitResult} from './types';
import {waitValidated} from './confirmation';
export interface WalletKitSession {
    getAccount():{address:string;network?:string|{id?:string}}|null;
    getNetwork():{id?:string}|null;
    signAndSubmit(request:{txJson:Record<string,unknown>}):Promise<{hash?:string}>;
}
export interface WalletKitSignerOptions {
    network:string;
    networkId:number;
    maxFeeDrops?:string;
    onSubmitted?:(hash:string)=>void;
}
type Rpc={request(request:any):Promise<any>};
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
    return {address,async signAndSubmit(tx):Promise<SignAndSubmitResult>{
        assertWalletKitSession(manager,options.network,address);
        if(tx.NetworkID!==undefined&&tx.NetworkID!==options.networkId)throw new Error('Incorrect NetworkID.');
        if(tx.Account!==undefined&&tx.Account!==address)throw new Error('Incorrect signing account.');
        if(tx.Fee!==undefined&&(!/^\d+$/.test(String(tx.Fee))||BigInt(String(tx.Fee))>BigInt(max)))throw new Error('The fee exceeds the configured limit.');
        const result=await manager.signAndSubmit({txJson:{...tx,Account:address,NetworkID:options.networkId}}),hash=result.hash;
        if(!hash||!/^[A-Fa-f0-9]{64}$/.test(hash))throw new Error('No transaction hash was returned. Check your wallet history before resubmitting.');
        options.onSubmitted?.(hash);
        const receipt=await waitValidated(rpc,hash),actual=receipt.tx_json??receipt;
        const mismatch=()=>Object.assign(new Error('The signed transaction does not match the request.'),{txHash:hash});
        if(actual.Account!==address||actual.NetworkID!==options.networkId||actual.TransactionType!==tx.TransactionType)throw mismatch();
        for(const key of Object.keys(tx)){
            if(key==='LastLedgerSequence')continue;
            if(canonical(actual[key])!==canonical(tx[key]))throw mismatch();
        }
        return{txHash:hash,engineResult:receipt.meta.TransactionResult,meta:receipt.meta,validated:true};
    }};
}
