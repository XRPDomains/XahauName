import type {OwnedDomainSummary} from '@xahauname/sdk';

export interface NameFilters {query:string;minLength:number;maxLength:number;characters:string;sort:string}
export function nameLengthRange(value:string){const length=Number(value);return value==='gt10'?{minLength:11,maxLength:57}:Number.isInteger(length)&&length>=1&&length<=10?{minLength:length,maxLength:length}:{minLength:1,maxLength:57};}
const WEEK=7*24*60*60*1000;
export const defaultNameFilters:NameFilters={query:'',minLength:1,maxLength:57,characters:'all',sort:'newest'};
const label=(name:string)=>name.slice(0,name.lastIndexOf('.'));
function registeredAt(record:OwnedDomainSummary){return record.mintedAt&&Number.isSafeInteger(record.mintedAt)?(record.mintedAt+946684800)*1000:0;}
export function isNewName(record:OwnedDomainSummary,recent:Record<string,number>,now=Date.now()){
 const time=Math.max(registeredAt(record),recent[record.domain]??0);
 return time>0&&time<=now&&now-time<WEEK;
}
/** Presentation only. Filtering and sorting never request ledger data. */
export function selectOwnedNames(records:OwnedDomainSummary[],primary:string|null,filters:NameFilters,recent:Record<string,number>={}){
 const query=filters.query.trim().toLowerCase();
 return records.filter(record=>{
  const text=label(record.domain),length=Array.from(text).length;
  if(!record.domain.includes(query)||length<filters.minLength||length>filters.maxLength)return false;
  return filters.characters==='letters'?/^[a-z]+$/.test(text):filters.characters==='numbers'?/^\d+$/.test(text):filters.characters==='mixed'?/^[a-z0-9]+$/.test(text)&&/[a-z]/.test(text)&&/\d/.test(text):filters.characters==='hyphenated'?text.includes('-'):true;
 }).sort((a,b)=>{
  const primaryOrder=Number(b.domain===primary)-Number(a.domain===primary);if(primaryOrder)return primaryOrder;
  const order=filters.sort==='shortest'?label(a.domain).length-label(b.domain).length:filters.sort==='longest'?label(b.domain).length-label(a.domain).length:filters.sort==='name'?0:Math.max(registeredAt(b),recent[b.domain]??0)-Math.max(registeredAt(a),recent[a.domain]??0);
  return order||(a.domain<b.domain?-1:a.domain>b.domain?1:0);
 });
}
/** Recent acquisitions are UI hints, scoped to a wallet and deployment, never ownership evidence. */
export function createRecentNames(storage:Pick<Storage,'getItem'|'setItem'>,scope:string){
 const key='xahauname:recent:v1:'+scope;
 const read=(now=Date.now()):Record<string,number>=>{try{
  const value=JSON.parse(storage.getItem(key)??'{}');if(!value||typeof value!=='object'||Array.isArray(value))return{};
  return Object.fromEntries(Object.entries(value).filter(([name,time])=>/^[a-z0-9-]{1,57}\.[a-z0-9]{2,8}$/.test(name)&&typeof time==='number'&&Number.isSafeInteger(time)&&time<=now&&now-time<WEEK).slice(0,200)) as Record<string,number>;
 }catch{return{};}};
 return{read,mark(name:string,now=Date.now()){const recent=read(now);delete recent[name];const entries=Object.entries({...recent,[name]:now}).slice(-200);try{storage.setItem(key,JSON.stringify(Object.fromEntries(entries)));}catch{/* Optional presentation hints cannot change transaction outcomes. */}}};
}
