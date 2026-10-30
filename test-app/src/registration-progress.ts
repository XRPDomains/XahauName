import type {RegistrationStatus} from '@xahauname/sdk';
export type CheckoutPhase='ready'|'payment-approval'|'payment-confirming'|'minting'|'claim-ready'|'claim-approval'|'claim-confirming'|'primary-approval'|'primary-confirming'|'complete'|'attention'|'uncertain';
export interface CheckoutState {phase:CheckoutPhase;completed:number;step:number;message:string;paymentHash?:string;claimHash?:string}
export interface PurchaseHint {name:string;account:string;paid:boolean;paymentStarted?:boolean;paymentHash?:string;claimHash?:string;claimStarted?:boolean;setPrimary?:boolean}
export function checkoutActions(status:RegistrationStatus,state:CheckoutState|null,hint:PurchaseHint|null,account:string|undefined,enabled:boolean){return{
 buy:status.stage==='available'&&!hint&&!state&&enabled,
 claim:status.stage==='awaitingClaim'&&status.recipient===account&&!!account&&state?.phase==='claim-ready'&&!hint?.claimHash&&!hint?.claimStarted,
 continue:status.stage==='pending'&&status.recipient===account&&!!account&&state?.phase==='minting'&&!hint?.claimHash&&!hint?.claimStarted,
};}
export function isUnstartedPurchase(hint:PurchaseHint|null){return !!hint&&hint.paymentStarted===false&&!hint.paid&&!hint.paymentHash&&!hint.claimHash&&!hint.claimStarted;}
export function isConfirmedFailure(receipt:any){return receipt?.validated===true&&/^tec[A-Z0-9_]+$/.test(receipt.meta?.TransactionResult??'');}
export function definitiveWalletDecline(error:any){
 const queue=[error],seen=new Set<unknown>();let declined=false;
 let budget=32;while(queue.length){if(--budget<0)return false;const value=queue.shift();if(!value||typeof value!=='object'||seen.has(value))continue;seen.add(value);
  if(value.txHash||value.hash||value.providerHash||value.providerRequestId||value.outcomeUnknown===true)return false;
  if(['4001','ACTION_REJECTED','SIGN_REJECTED'].includes(String(value.code)))declined=true;
  queue.push(value.cause,value.data,value.details);
 }
 return declined;
}
export function checkoutFromLedger(status:RegistrationStatus,hint:PurchaseHint|null):CheckoutState|null{
 const hashes={paymentHash:hint?.paymentHash,claimHash:hint?.claimHash};
 if(status.stage==='available')return hint?{phase:'uncertain',completed:0,step:0,message:'A previous purchase needs checking. Check its status before paying again.',...hashes}:null;
 if(status.stage==='claimed')return hint?{phase:'complete',completed:3,step:3,message:'Ownership is confirmed on-chain.',...hashes}:null;
 if(status.stage==='pending')return hint?.claimStarted||hint?.claimHash?{phase:'uncertain',completed:1,step:2,message:'A previous claim needs checking before continuing.',...hashes}:{phase:'minting',completed:1,step:1,message:'Creating the token and preparing its claim offer.',...hashes};
 if(status.stage==='awaitingClaim')return hint?.claimHash||hint?.claimStarted?{phase:'uncertain',completed:2,step:2,message:hint?.claimHash?'Your previous claim is unconfirmed. Check its transaction, or open My names → Ready to claim. Do not buy again.':'No claim hash was returned. Open My names → Ready to claim and check your wallet before approving another claim. Do not buy again.',...hashes}:{phase:'claim-ready',completed:2,step:2,message:'Your name is ready to accept in the recipient wallet.',...hashes};
 return{phase:'attention',completed:0,step:1,message:status.stage==='refundPending'?'Refund tracking needs checking. Do not send another payment.':'This name needs recovery. Do not repeat a payment or claim.',...hashes};
}
/** Public hints only. Ledger reads, not this journal, authorize every continuation. */
export function createPurchaseJournal(storage:Pick<Storage,'getItem'|'setItem'>,scope:string){
 const key='xahauname:purchase:v1:'+scope;
 const read=():PurchaseHint[]=>{try{const data=JSON.parse(storage.getItem(key)??'[]');if(!Array.isArray(data))return[];return data.slice(0,20).filter((item:any)=>item&&typeof item.name==='string'&&/^[a-z0-9-]{1,57}\.[a-z0-9]{2,8}$/.test(item.name)&&typeof item.account==='string'&&/^r[a-zA-Z0-9]{24,}$/.test(item.account)&&typeof item.paid==='boolean'&&(item.paymentStarted===undefined||typeof item.paymentStarted==='boolean')&&(item.claimStarted===undefined||typeof item.claimStarted==='boolean')&&(item.setPrimary===undefined||typeof item.setPrimary==='boolean')&&[item.paymentHash,item.claimHash].every(hash=>hash===undefined||/^[a-f0-9]{64}$/i.test(hash))).map((item:any)=>({name:item.name,account:item.account,paid:item.paid,paymentStarted:item.paymentStarted,paymentHash:item.paymentHash,claimHash:item.claimHash,claimStarted:item.claimStarted,setPrimary:item.setPrimary}));}catch{return[];}};
 return{
  get:(name:string)=>read().find(item=>item.name===name)??null,
  latest:()=>read().at(-1)??null,
  save(hint:PurchaseHint){const hints=read().filter(item=>item.name!==hint.name);if(hints.length>=20)throw new Error('Check the status of previous purchases before starting another.');storage.setItem(key,JSON.stringify([...hints,hint]));},
  clear(name:string){storage.setItem(key,JSON.stringify(read().filter(item=>item.name!==name)));},
 };
}
