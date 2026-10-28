import {encodeAddress,normalizeDomainInput,XahauNameError} from '@xahauname/sdk';

export interface TransferRecipient {address:string;domain?:string}
export type RecipientPreviewState = {status:'idle'|'loading'}|{status:'ready';recipient:TransferRecipient}|{status:'error';error:unknown};

/** Coalesce change/blur reads and discard replies for edited or closed dialogs. */
export function createTransferRecipientPreview(lookup:(name:string)=>Promise<string|null>,notify:(state:RecipientPreviewState)=>void){
 let revision=0,key='',state:RecipientPreviewState={status:'idle'},pending:Promise<TransferRecipient|null>|undefined;
 const publish=(next:RecipientPreviewState)=>{state=next;notify(next);};
 return{
  get state(){return state;},
  get version(){return revision;},
  reset(){revision++;key='';pending=undefined;publish({status:'idle'});},
  resolve(input:string):Promise<TransferRecipient|null>{
   const value=input.trim();
   if(!value){this.reset();return Promise.resolve(null);}
   if(value===key){if(pending)return pending;if(state.status==='ready')return Promise.resolve(state.recipient);}
   key=value;const request=++revision;publish({status:'loading'});
   pending=resolveTransferRecipient(value,lookup).then(recipient=>{
    if(request!==revision)return null;
    publish({status:'ready',recipient});return recipient;
   },error=>{
    if(request!==revision)return null;
    publish({status:'error',error});throw error;
   }).finally(()=>{if(request===revision)pending=undefined;});
   return pending;
  },
 };
}
/** Domain transfers target the verified current owner, independently of address records. */
export async function resolveTransferRecipient(input:string,lookup:(name:string)=>Promise<string|null>):Promise<TransferRecipient>{
 const value=input.trim();
 try{encodeAddress(21337,value);return{address:value};}catch{/* Otherwise consider a domain. */}
 if(!value||(/^r[a-zA-Z0-9]{24,}$/.test(value)&&!value.includes('.')))
  throw new XahauNameError('Enter a valid wallet address or domain','INVALID_ARGUMENT');
 const domain=normalizeDomainInput(value),address=await lookup(domain);
 if(!address)throw new XahauNameError(`${domain} has no verified owner. Check the domain or enter the recipient's wallet address.`,'INVALID_ARGUMENT');
 try{encodeAddress(21337,address);}catch{throw new XahauNameError('The domain has an invalid owner address','INVALID_ARGUMENT');}
 return{address,domain};
}
