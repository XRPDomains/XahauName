// Read-only Xahau RPC example. No @xahauname/sdk, signer, seed or submission.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Client,decodeAccountID,encodeAccountID} from 'xahau';

export const hashHalf=bytes=>createHash('sha512').update(bytes).digest().subarray(0,32);
const hex=bytes=>Buffer.from(bytes).toString('hex').toUpperCase();
const fixedKey=(prefix,id,length)=>hex(Buffer.concat([Buffer.from(prefix,'ascii'),Buffer.from(id,'hex').subarray(0,length)]));
export function domainKeys(domain){
 if(!/^[a-z0-9](?:[a-z0-9-]{0,55}[a-z0-9])?\.[a-z0-9]{2,8}$/.test(domain))throw new Error('Use a canonical lowercase domain');
 const root=hex(hashHalf(Buffer.from(domain+':root')));
 return{root,token:hex(hashHalf(Buffer.from(domain+':token'))),records:hex(hashHalf(Buffer.from(domain+':records'))),recovery:fixedKey('rcv:',root,28)};
}
export function verifyEvidence({domain,treasury,root,tokenId,token,reverse}){
 if(!Buffer.isBuffer(root)||root.length!==32)throw new Error('Root must be exactly 32 bytes');
 if(!/^[A-F0-9]{64}$/.test(tokenId))throw new Error('Token mapping must be exactly 32 bytes');
 if(token?.LedgerEntryType!=='URIToken'||token.Issuer!==treasury||token.index?.toUpperCase()!==tokenId)throw new Error('Native token identity mismatch');
 if(typeof token.URI!=='string'||!/^([a-f0-9]{2})+$/i.test(token.URI))throw new Error('Malformed native URI bytes');
 const expected=hex(hashHalf(Buffer.concat([Buffer.from([0,0x55]),Buffer.from(decodeAccountID(treasury)),Buffer.from(token.URI,'hex')])));
 if(expected!==tokenId||reverse!==domain)throw new Error('Domain/token reverse mapping mismatch');
 const owner=encodeAccountID(root.subarray(0,20));
 if(owner!==token.Owner)throw new Error('Root and native owner differ; reconciliation required');
 return{owner,primary:!!(root[20]&1),mintedAtRippleSeconds:root.readBigUInt64BE(21).toString(),tokenId};
}

export async function verifyDomain(domain,manifest){
 const keys=domainKeys(domain);
 if(!Number.isSafeInteger(manifest.networkID)||!/^wss:\/\//.test(manifest.rpc)||!/^([a-f0-9]{64})$/i.test(manifest.namespace)||!Array.isArray(manifest.handlers)||!manifest.handlers.length)throw new Error('Invalid public deployment manifest');
 const client=new Client(manifest.rpc,{connectionTimeout:10000});
 try{
  await client.connect();
  const info=(await client.request({command:'server_info'})).result.info;
  if(info.network_id!==manifest.networkID)throw new Error('RPC network differs from manifest');
  const ledger=(await client.request({command:'ledger',ledger_index:'validated',transactions:false,expand:false})).result;
  if(ledger.validated!==true||!/^[a-f0-9]{64}$/i.test(ledger.ledger_hash))throw new Error('Validated ledger hash unavailable');
  const ledgerHash=ledger.ledger_hash;
  const request=async args=>{
   const result=(await client.request({...args,ledger_hash:ledgerHash})).result;
   if(result.ledger_hash&&result.ledger_hash.toUpperCase()!==ledgerHash.toUpperCase())throw new Error('RPC ledger mismatch');
   return result;
  };
  const hooks=await request({command:'account_objects',account:manifest.treasury,type:'hook'});
  const installed=(hooks.account_objects??[]).flatMap(object=>(object.Hooks??[]).map(slot=>slot.Hook?.HookHash)).filter(Boolean);
  if(hooks.marker||installed.length!==manifest.handlers.length||manifest.handlers.some((handler,index)=>handler.hash!==installed[index]))throw new Error('Installed hook chain differs from manifest');
  const state=async key=>{
   try{
    const result=await request({command:'ledger_entry',hook_state:{account:manifest.treasury,key,namespace_id:manifest.namespace}});
    if(result.node?.LedgerEntryType!=='HookState'||typeof result.node.HookStateData!=='string'||!/^(?:[a-f0-9]{2})*$/i.test(result.node.HookStateData))throw new Error('Malformed HookState');
    return Buffer.from(result.node.HookStateData,'hex');
   }catch(error){if(error.data?.error==='entryNotFound')return null;throw error;}
  };
  const [root,mapping,journal]=await Promise.all([state(keys.root),state(keys.token),state(keys.recovery)]);
  if(journal)throw new Error('Recovery journal present; domain is not finalized');
  if(!root)return{domain,ledgerHash,verified:false,reason:'No finalized root; inspect registration tracking before assuming availability'};
  if(!mapping||mapping.length!==32)throw new Error('Missing/malformed full token mapping; do not guess from current URIBase');
  const tokenId=hex(mapping);
  const [native,reverse,uriReverse,...tracking]=await Promise.all([
   request({command:'ledger_entry',index:tokenId}),state(fixedKey('lof:',tokenId,28)),state(fixedKey('uri:',tokenId,28)),
   state(fixedKey('pending:',tokenId,24)),...['mnt','ofr','rfd'].map(stage=>state(fixedKey(stage+':',tokenId,28))),
  ]);
  if(tracking.some(Boolean))throw new Error('Unresolved pending/emission/refund tracking; stop normal writes');
  const reverseBytes=reverse??uriReverse;
  const evidence=verifyEvidence({domain,treasury:manifest.treasury,root,tokenId,token:native.node,reverse:reverseBytes?new TextDecoder('utf-8',{fatal:true}).decode(reverseBytes):null});
  return{domain,ledgerHash,networkID:manifest.networkID,verified:true,...evidence};
 }finally{await client.disconnect();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [domain,deploymentFile]=process.argv.slice(2);
 if(!domain){console.error('Usage: node verify-domain.mjs domain.xah [public-deployment.json]');process.exitCode=1;}
 else try{
  const manifest=JSON.parse(readFileSync(deploymentFile??new URL('../../deployments/testnet.json',import.meta.url),'utf8'));
  console.log(JSON.stringify(await verifyDomain(domain,manifest),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
