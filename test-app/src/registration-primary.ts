import {util,type XahauNameClient,type TxResult} from '@xahauname/sdk';
import {definitiveWalletDecline} from './registration-progress';
export type PrimaryOutcome='skipped'|'set'|'not-set'|'unknown';
/** Runs only after a verified claim. Failure cannot undo or replay the purchase. */
export async function applyRegistrationPrimary(client:Pick<XahauNameClient,'read'|'resolver'>,name:string,account:string,requested:boolean,assertCurrent:()=>void):Promise<{outcome:PrimaryOutcome;result?:TxResult;error?:unknown}>{
 if(!requested)return{outcome:'skipped'};
 let dispatched=false;
 try{
  assertCurrent();const owner=await client.read.getOwner({name,bypassCache:true});assertCurrent();
  if(owner!==account)throw new Error('The claiming wallet no longer owns this name.');
  dispatched=true;
  const result=await client.resolver.setPrimary({...util.splitDomain(name),flag:true});
  return{outcome:'set',result};
 }catch(error){return{outcome:!dispatched||definitiveWalletDecline(error)?'not-set':'unknown',error};}
}
