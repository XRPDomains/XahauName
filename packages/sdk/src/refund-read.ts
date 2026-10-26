import type {ClientContext} from './context';
import type {RefundStatus, RegistrationStatus} from './types';
import {XahauNameError} from './errors';

/** Explicit diagnostic read; never authorizes another payment or changes registration state. */
export async function readRefundStatus(ctx:ClientContext,status:RegistrationStatus):Promise<RefundStatus> {
    const result:RefundStatus={domain:status.domain,uritokenId:status.uritokenId,ledgerHash:status.ledgerHash,
        state:'notTracked',recovery:'none'};
    if(!status.refundTxHash)return result;
    Object.assign(result,{transactionHash:status.refundTxHash,recipient:status.recipient,amountDrops:status.amountDrops,
        state:'unknown',recovery:'operator'});
    if(!status.recipient||status.amountDrops===undefined)return {...result,reason:'missingPending'};
    let receipt;
    try {receipt=await ctx.request({command:'tx',transaction:status.refundTxHash,binary:false});}
    catch(error:any){
        if(error?.data?.error==='txnNotFound'||error?.code==='txnNotFound')return {...result,reason:'receiptUnavailable',recovery:'check-status'};
        throw error;
    }
    if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))
        throw new XahauNameError('Invalid refund receipt','BAD_RPC_RESPONSE');
    if(receipt.validated!==true)return {...result,state:'unvalidated',reason:'notValidated',recovery:'check-status'};
    const tx=receipt.tx_json??receipt,meta=receipt.meta;
    const invalid=()=>new XahauNameError('Refund receipt does not match tracked payment','BAD_RPC_RESPONSE');
    if(String(receipt.hash??tx.hash??'').toUpperCase()!==status.refundTxHash || tx.TransactionType!=='Payment' ||
        tx.Account!==ctx.treasury || tx.Destination!==status.recipient || tx.InvoiceID!==status.uritokenId ||
        tx.Amount!==status.amountDrops.toString() || tx.Sequence!==0 || (tx.Flags!==undefined&&tx.Flags!==0) || !tx.EmitDetails ||
        typeof tx.EmitDetails!=='object' || Array.isArray(tx.EmitDetails) ||
        !Number.isSafeInteger(receipt.ledger_index) || receipt.ledger_index<1 ||
        !meta || typeof meta.TransactionResult!=='string' || !/^(?:tesSUCCESS|tec[A-Z0-9_]+)$/.test(meta.TransactionResult))throw invalid();
    const header=await ctx.request({command:'ledger',ledger_hash:status.ledgerHash,transactions:false});
    if(!header||typeof header!=='object'||Array.isArray(header))
        throw new XahauNameError('Invalid refund snapshot ledger','BAD_RPC_RESPONSE');
    const index=Number(header.ledger?.ledger_index),hash=String(header.ledger_hash??header.ledger?.ledger_hash??'').toUpperCase();
    if(header.validated!==true||hash!==status.ledgerHash.toUpperCase()||!Number.isSafeInteger(index)||index<1)
        throw new XahauNameError('Invalid refund snapshot ledger','BAD_RPC_RESPONSE');
    if(receipt.ledger_index>index)return {...result,reason:'afterSnapshot',recovery:'check-status'};
    return {...result,state:meta.TransactionResult==='tesSUCCESS'?'paid':'failed',
        transactionLedgerIndex:receipt.ledger_index,engineResult:meta.TransactionResult};
}
