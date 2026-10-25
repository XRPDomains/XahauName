import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {root} from './toolchain.mjs';
const require=createRequire(import.meta.url),{XahauNameClient,resolveNetworkConfig}=require(path.join(root,'packages/sdk/dist'));
export function deploymentConfig(network,file,wss){
 const manifest=JSON.parse(fs.readFileSync(file??path.join(root,'deployments',network+'.json')));
 if(manifest.network!=='xahau-'+network)throw new Error('Deployment/network mismatch');
 return {manifest,config:resolveNetworkConfig({network,wss:wss??manifest.rpc,deployment:{treasury:manifest.treasury,namespaceId:manifest.namespace,expectedNetworkId:manifest.networkID,hookHashes:Object.fromEntries(manifest.handlers.map(h=>[h.name,h.hash]))}})};
}
export async function capture(network,manifest,config){
 const client=new XahauNameClient({...config,connectionTimeoutMs:6000,connectionAttempts:2});
 client.rawClient.on('error',()=>{});
 try{
  await client.connect();const ledgerHash=await client.getLedgerHash();
  const request=async params=>(await client.rawClient.request(params)).result;
  const header=await request({command:'ledger',ledger_hash:ledgerHash,transactions:false});
  const ledgerIndex=Number(header.ledger_index??header.ledger?.ledger_index);
  if(!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1)throw new Error('Missing snapshot ledger index');
  const info=await request({command:'account_info',account:config.treasury,ledger_hash:ledgerHash});
  const accountNamespaces=info.account_data?.HookNamespaces;
  if(!Array.isArray(accountNamespaces)||accountNamespaces.length!==1||accountNamespaces[0]!==config.namespaceId)throw new Error('Inventory all additional account namespaces before claiming complete ABI coverage');
  const objects=await request({command:'account_objects',account:config.treasury,type:'hook',ledger_hash:ledgerHash});
  const installed=(objects.account_objects??[]).flatMap(o=>o.Hooks??[]).map(row=>row.Hook);
  if(installed.length!==manifest.handlers.length||installed.some((h,i)=>h.HookHash!==manifest.handlers[i].hash))throw new Error('Installed hook chain differs from deployment');
  const hooks=[];
  for(const [index,hook]of installed.entries()){
   const namespace=hook.HookNamespace??(await request({command:'ledger_entry',hook_definition:hook.HookHash,ledger_hash:ledgerHash})).node?.HookNamespace;
   if(namespace!==config.namespaceId)throw new Error('Unexpected effective hook namespace');
   hooks.push({name:manifest.handlers[index].name,hash:hook.HookHash,namespace});
  }
  const entries=[],seen=new Set();let marker;
  do{
   const page=await request({command:'account_namespace',account:config.treasury,namespace_id:config.namespaceId,ledger_hash:ledgerHash,limit:400,...(marker!==undefined?{marker}:{})});
   if(!Array.isArray(page.namespace_entries))throw new Error('Invalid namespace page');
   if(page.ledger_hash&&page.ledger_hash!==ledgerHash)throw new Error('Mixed snapshot ledgers');
   entries.push(...page.namespace_entries.map(e=>({key:e.HookStateKey,value:e.HookStateData})));
   marker=page.marker;if(marker!==undefined){const encoded=JSON.stringify(marker);if(seen.has(encoded))throw new Error('Repeated namespace pagination marker');seen.add(encoded);}
  }while(marker!==undefined);
  return {schemaVersion:1,network,networkId:config.expectedNetworkId,treasury:config.treasury,namespace:config.namespaceId,accountNamespaces,ledgerHash,ledgerIndex,hooks,hookHashes:config.hookHashes,entries};
 }finally{await client.disconnect();}
}
export function validateSnapshot(snapshot,network,config){
 if(snapshot.schemaVersion!==1||snapshot.network!==network||snapshot.networkId!==config.expectedNetworkId||snapshot.treasury!==config.treasury||snapshot.namespace!==config.namespaceId||!/^[A-F0-9]{64}$/.test(snapshot.ledgerHash)||!Number.isSafeInteger(snapshot.ledgerIndex)||snapshot.ledgerIndex<1||!Array.isArray(snapshot.entries))throw new Error('Snapshot/deployment identity mismatch');
 if(!Array.isArray(snapshot.accountNamespaces)||snapshot.accountNamespaces.length!==1||snapshot.accountNamespaces[0]!==config.namespaceId)throw new Error('Snapshot account namespace inventory mismatch');
 const expected=Object.entries(config.hookHashes);
 if(Object.keys(snapshot.hookHashes??{}).length!==expected.length||expected.some(([name,hash])=>snapshot.hookHashes[name]!==hash))throw new Error('Snapshot hook hash mismatch');
 if(!Array.isArray(snapshot.hooks)||snapshot.hooks.length!==expected.length||snapshot.hooks.some(h=>h.namespace!==config.namespaceId||config.hookHashes[h.name]!==h.hash)||new Set(snapshot.hooks.map(h=>h.name)).size!==expected.length)throw new Error('Snapshot effective namespace mismatch');
 return snapshot;
}
