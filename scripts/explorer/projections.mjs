import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {root} from './toolchain.mjs';
const require=createRequire(import.meta.url),sdk=require(path.join(root,'packages/sdk/dist'));
export const layout=JSON.parse(fs.readFileSync(path.join(root,'protocol/state-layouts.json')));
const schema=JSON.parse(fs.readFileSync(path.join(root,'protocol/schema.json')));
const {util}=sdk;
const number=(type,label,description)=>({type,label,...(type.endsWith('8')?{}:{endianness:'BE'}),...(description?{description}:{})});
const hash=label=>({type:'Hash256',label});
const account=label=>({type:'AccountID',label});
const reserved=byteLength=>({type:'Null',byteLength,exclude:true});
const text=label=>({type:'VarString',label});
const rootFields=()=>[account('Owner'),number('UInt8','Flags','Bit 0: primary. Legacy lock bit is retired.'),number('UInt64','Minted at','Seconds since 2000-01-01; 8 bytes, not ABI Timestamp.'),reserved(layout.root.length-layout.root.reserved)];
export function fields(kind,bytes){
 switch(kind){
  case 'root':return rootFields();
  case 'pricing':return [{type:'UInt8',label:'Version',pattern:String(layout.pricing.version)},{type:'Array',label:'Prices in drops',repeat:layout.pricing.tiers,items:[number('UInt64','Drops','Tiers 1..9, then 10+ characters; integer drops.')]}];
  case 'pending':return [account('Destination'),number('UInt64','Paid drops'),number('UInt32','Flags','Mint progress uses the most significant byte; preserve all bits.')];
  case 'records':return [{type:'UInt8',label:'Version',pattern:String(layout.records.version)},number('UInt16','Address count'),number('UInt8','Text count'),{type:'Array',label:'Coin types',repeat:layout.records.maxAddresses,items:[number('UInt16','Coin type')]},{type:'Array',label:'Text descriptors',repeat:layout.records.maxTexts,items:[{type:'UInt8',label:'Tag'},{type:'UInt8',label:'Length or slot'},{type:'Blob',byteLength:layout.records.textBytes-2,label:'Descriptor bytes'}]}];
  case 'token':case 'primary':case 'mint':case 'offer':case 'refund':return [hash(kind==='primary'?'Root state key':kind==='token'?'Full URITokenID':'Emitted transaction hash')];
  case 'labelOf':case 'uri':return [text('Canonical domain')];
  case 'uriBase':return [text('URI base')];
  case 'paused':case 'tld':return [number('UInt8',kind==='tld'?'Enabled':'Paused','0 = false, 1 = true. TLD 0 is a disabled tombstone.')];
  case 'customTextSlot':return bytes.length===layout.customTextSlot.legacyLength?[hash('Text state key')]:[hash('Text state key'),text('Custom key name')];
  case 'text':return [text('Value')];
  case 'address':return [{type:'Blob',byteLength:bytes.length,label:'Address bytes',description:'Raw ENSIP-9/SLIP-0044 record. Decode with the SDK coin codec; this is not always a 20-byte AccountID.'}];
  case 'recovery':return [{type:'UInt8',label:'Version',pattern:String(layout.recovery.version)},number('UInt8','Had root'),hash('Full URITokenID'),{type:'STObject',label:'Original root',items:rootFields()},{type:'UInt8',label:'Name length'},text('Canonical domain')];
  default:throw new Error('Unknown record kind '+kind);
 }
}
function canonical(name){const {label,tld}=util.splitDomain(name);sdk.domainFields(label,tld);if(util.joinDomain(label,tld)!==name)throw new Error('Noncanonical state name');return name;}
function utf8(bytes){return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
function validate(kind,bytes){
 const fixed={root:layout.root.length,pricing:layout.pricing.length,pending:layout.pending.length,records:layout.records.length,token:32,primary:32,mint:32,offer:32,refund:32,paused:1,tld:1};
 if(fixed[kind]!==undefined&&bytes.length!==fixed[kind])throw new Error('Invalid '+kind+' length');
 if(kind==='address'&&(bytes.length<1||bytes.length>128))throw new Error('Invalid address length');
 if(kind==='text'&&bytes.length>128||kind==='uriBase'&&bytes.length>120)throw new Error('Invalid '+kind+' length');
 if(['text','uriBase','labelOf','uri'].includes(kind)){const value=utf8(bytes);if(!bytes.length)throw new Error('Empty '+kind);if(['labelOf','uri'].includes(kind))canonical(value);}
 if(kind==='customTextSlot'&&(bytes.length<32||bytes.length>72))throw new Error('Invalid custom descriptor');
 if(kind==='recovery'&&(bytes.length<70||bytes.length>133||bytes[0]!==1||bytes[1]>1||bytes.length!==layout.recovery.name+bytes[layout.recovery.nameLength]))throw new Error('Invalid lifecycle journal');
}
function sample(kind,name,treasury){
 const {label,tld}=util.splitDomain(name),id=Buffer.alloc(32,0xAB),owner=Buffer.from(require('xahau').decodeAccountID(treasury)),rootBytes=Buffer.alloc(layout.root.length);owner.copy(rootBytes);rootBytes.writeBigUInt64BE(800000000n,layout.root.mintedAt);
 switch(kind){
  case 'root':return rootBytes;
  case 'pending':{const b=Buffer.alloc(layout.pending.length);owner.copy(b);b.writeBigUInt64BE(123456789n,layout.pending.amountDrops);b[layout.pending.flags]=0x80;return b;}
  case 'pricing':{const b=Buffer.alloc(layout.pricing.length);b[0]=layout.pricing.version;for(let i=0;i<layout.pricing.tiers;i++)b.writeBigUInt64BE(BigInt(i+1),layout.pricing.prices+i*layout.pricing.priceBytes);return b;}
  case 'records':{const b=Buffer.alloc(layout.records.length);b[0]=layout.records.version;return b;}
  case 'token':case 'primary':case 'mint':case 'offer':case 'refund':return id;
  case 'labelOf':case 'uri':return Buffer.from(name);
  case 'uriBase':return Buffer.from('https://example.com/metadata/');
  case 'paused':case 'tld':return Buffer.from([1]);
  case 'customTextSlot':return Buffer.concat([Buffer.from(util.textKey(label,tld,'custom.example'),'hex'),Buffer.from('custom.example')]);
  case 'text':return Buffer.from('Example text');
  case 'address':return owner;
  case 'recovery':{const b=Buffer.alloc(layout.recovery.name+name.length);b[0]=1;b[1]=1;id.copy(b,layout.recovery.tokenId);rootBytes.copy(b,layout.recovery.originalRoot);b[layout.recovery.nameLength]=name.length;b.write(name,layout.recovery.name);return b;}
 }
}

/** Exact selectors are intentionally snapshot-bound: hashed keys cannot be reversed by the explorer. */
export async function generate(snapshot,catalog){
 const rows=new Map(),declared=new Map(),names=new Set(catalog.domains??[]),owners=new Set(catalog.owners??[]);
 for(const {key,value}of snapshot.entries){if(!/^[A-Fa-f0-9]{64}$/.test(key)||!/^(?:[A-Fa-f0-9]{2})+$/.test(value)||rows.has(key.toUpperCase()))throw new Error('Malformed or duplicate state');rows.set(key.toUpperCase(),value.toUpperCase());}
 const declaration=(key,kind,label,always=false)=>{
  key=key.toUpperCase();if(!always&&!rows.has(key))return;
  const old=declared.get(key);if(old&&old.kind!==kind)throw new Error('Ambiguous key '+key+' ('+old.kind+'/'+kind+')');
  if(!old)declared.set(key,{key,kind,label});
 };
 for(const [key,value]of rows){
  const bytes=Buffer.from(key,'hex'),prefix=bytes.subarray(0,4).toString(),data=Buffer.from(value,'hex');
  for(const kind of ['labelOf','uri','mint','offer','refund','pending','recovery']){
   const tag=layout.prefixes[kind];if(!bytes.subarray(0,tag.length).equals(Buffer.from(tag)))continue;
   validate(kind,data);declaration(key,kind,kind+' / '+key.slice(tag.length*2,tag.length*2+12));
   if(kind==='labelOf'||kind==='uri')names.add(canonical(utf8(data)));
   if(kind==='recovery'){const name=canonical(utf8(data.subarray(layout.recovery.name))),{label,tld}=util.splitDomain(name);if(util.recoveryKey(label,tld)!==key)throw new Error('Journal/name key mismatch');names.add(name);if(data[layout.recovery.hadRoot])owners.add(util.decodeRoot(data.subarray(layout.recovery.originalRoot,layout.recovery.nameLength)).owner);}
   break;
  }
 }
 for(const name of names)canonical(name);
 declaration(util.pricingKey(),'pricing','Pricing',true);declaration(util.pausedKey(),'paused','Pause flag',true);declaration(util.uriBaseKey(),'uriBase','URI base',true);
 for(const tld of catalog.tlds??[]){sdk.domainFields('abi-example',tld);if(tld!==tld.toLowerCase())throw new Error('Noncanonical TLD');declaration(util.tldKey(tld),'tld','TLD '+tld,true);}
 const ctx={treasury:snapshot.treasury,ledgerHash:async()=>snapshot.ledgerHash,readState:async key=>rows.has(key)?Buffer.from(rows.get(key),'hex'):null};
 const resolver=new sdk.ResolverModule(ctx);
 for(const name of [...names].sort()){
  const {label,tld}=util.splitDomain(name),rk=util.rootKey(label,tld),rootHex=rows.get(rk);
  declaration(rk,'root',name+' / ownership');declaration(util.tokenKey(label,tld),'token',name+' / URITokenID');declaration(util.recordsKey(label,tld),'records',name+' / record inventory');
  if(rootHex)owners.add(util.decodeRoot(Buffer.from(rootHex,'hex')).owner);
  const keys=await resolver.getRecordKeys(name,{ledgerHash:snapshot.ledgerHash});
  for(const coin of new Set([...keys.addrs,...Object.values(sdk.COIN_TYPES),...Object.values(sdk.LEGACY_COIN_TYPES),...(catalog.coinTypes??[])])){sdk.coinBytes(coin);declaration(util.addrKey(label,tld,coin),'address',name+' / coin '+coin);}
  for(const key of new Set([...keys.texts,...schema.standardTextKeys,...(catalog.customTextKeys?.[name]??[])])){if(sdk.textKeyBytes(key).toString()!==key)throw new Error('Noncanonical catalog text key');declaration(util.textKey(label,tld,key),'text',name+' / '+key);}
  for(const key of keys.unnamedTextStateKeys)declaration(key,'text',name+' / unnamed legacy text '+key.slice(0,8));
  for(let slot=0;slot<layout.records.maxTexts;slot++){
   const key=util.textSlotKey(label,tld,slot),value=rows.get(key);if(!value)continue;
   declaration(key,'customTextSlot',name+' / custom descriptor '+slot);
   const data=Buffer.from(value,'hex');validate('customTextSlot',data);declaration(data.subarray(0,32).toString('hex'),'text',name+' / custom value '+slot);
  }
 }
 for(const owner of owners){require('xahau').decodeAccountID(owner);declaration(util.primaryOfKey(owner),'primary','Primary / '+owner);}
 const unknown=[...rows.keys()].filter(key=>!declared.has(key));
 if(unknown.length)throw new Error('Undecoded state keys ('+unknown.length+'). Extend the catalog; never guess by length: '+unknown.slice(0,5).join(', '));
 const exampleName=[...names].sort()[0]??'abi-example.xah',example=util.splitDomain(exampleName),exampleId='AB'.repeat(32);
 const fallbackKeys={root:util.rootKey(example.label,example.tld),token:util.tokenKey(example.label,example.tld),records:util.recordsKey(example.label,example.tld),text:util.textKey(example.label,example.tld,'custom.example'),address:util.addrKey(example.label,example.tld,21337),customTextSlot:util.textSlotKey(example.label,example.tld,0),primary:util.primaryOfKey([...owners][0]??snapshot.treasury),labelOf:util.labelOfKey(exampleId),uri:util.uriKey(exampleId),pending:util.pendingKey(exampleId),mint:util.asyncKey('mnt',exampleId),offer:util.asyncKey('ofr',exampleId),refund:util.asyncKey('rfd',exampleId),recovery:util.recoveryKey(example.label,example.tld)};
 for(const kind of Object.keys(layout.abiOwners))if(![...declared.values()].some(row=>row.kind===kind)){
  if(!fallbackKeys[kind])throw new Error('No fixture key for '+kind);
  declaration(fallbackKeys[kind],kind,exampleName+' / '+kind,true);
 }
 const projections=Object.fromEntries(Object.keys(snapshot.hookHashes).map(name=>[name,[]])),extra=[],counts={};
 for(const item of [...declared.values()].sort((a,b)=>a.key.localeCompare(b.key))){
  const bytes=rows.has(item.key)?Buffer.from(rows.get(item.key),'hex'):sample(item.kind,exampleName,snapshot.treasury);validate(item.kind,bytes);
  const owner=layout.abiOwners[item.kind];if(!projections[owner])throw new Error('ABI owner is not installed: '+owner);
  const title=item.label.length>100?item.label.slice(0,85)+' / '+item.key.slice(0,10):item.label;
  projections[owner].push({name:title,description:`${item.kind}; exact key from the named snapshot/catalog. Refresh after domain or profile changes.`,selector:[{type:'Hash256',label:'State key',pattern:item.key,patternEncoding:'hex'}],data:fields(item.kind,bytes)});
  counts[item.kind]=(counts[item.kind]??0)+1;
  if(!rows.has(item.key))extra.push({k:item.key,v:bytes.toString('hex').toUpperCase(),note:'Synthetic source-layout fixture for '+item.kind+'; not a ledger entry.'});
 }
 for(const [name,items]of Object.entries(projections))if(items.length>200)throw new Error(name+' exceeds the explorer 200-projection limit; use the SDK/indexer for large collections');
 return {projections,extra,counts,names:[...names].sort(),classifiedEntries:rows.size};
}
