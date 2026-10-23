const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Client,Wallet}=require('../../sdk/node_modules/xahau');
const repo=path.resolve(__dirname,'../..'),base=path.join(repo,'hook/build/current'),out=path.join(base,process.env.XAHAU_DEPLOY_RUN??'deployment'),manifestPath=path.join(repo,'deployments/testnet.json'),checkOnly=process.argv.includes('--check');
assert(/^[a-z0-9-]+$/i.test(path.basename(out))&&path.dirname(out)===base,'Invalid deployment journal directory');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const save=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2)+'\n');
function environment(file){return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));}
async function hooks(c,account){return(await c.request({command:'account_objects',account,type:'hook',ledger_index:'validated'})).result.account_objects.flatMap(o=>o.Hooks??[]);}
async function state(c,account,namespace){let marker;const values=[];do{const r=await c.request({command:'account_namespace',account,namespace_id:namespace,ledger_index:'validated',...(marker?{marker}:{})});values.push(...r.result.namespace_entries.map(e=>({key:e.HookStateKey,value:e.HookStateData})));marker=r.result.marker;}while(marker);return values.sort((a,b)=>a.key.localeCompare(b.key));}
async function main(){
 const previous=read(manifestPath);assert.equal(previous.networkID,21338);assert.equal(previous.rpc,'wss://xahau-test.net');
 assert(checkOnly||process.env.XAHAU_DEPLOY_TESTNET==='1','Explicit XAHAU_DEPLOY_TESTNET=1 required');
 fs.mkdirSync(out,{recursive:true});assert(!fs.existsSync(path.join(out,'submission.json')),'Existing signed transaction journal: inspect its receipt before any retry');
 const parts=read(path.join(repo,'hook/config/handlers.json'));assert.equal(parts.length,10);
 for(const file of ['test-results.json','policy-results.json','profile-batch/probes.json','validation-results.json']){const rows=read(path.join(base,file));assert(rows.length>0&&rows.every(r=>r.pass),'Failing/missing artifact probes');}
 const verified=read(path.join(base,'verification.json'));
 const common=fs.readFileSync(path.join(repo,'hook/src/common.h'));
 const artifacts=parts.map((name,position)=>{
  const dir=path.join(base,name),proof=read(path.join(dir,'proof.json')),code=fs.readFileSync(path.join(dir,'xahau-name-hook.cleaned.wasm')),source=fs.readFileSync(path.join(repo,'hook/src/handlers',name+'.c'));
  assert.equal(proof.sourceSha256,sha(Buffer.concat([common,source])));assert.equal(proof.sha256,sha(code));assert.equal(verified.artifacts.find(a=>a.name===name)?.sha256,sha(code),'Untested artifact');assert(proof.guardPassed&&code.length<65536&&WebAssembly.validate(code));assert(fs.readFileSync(path.join(dir,'guard-check.log'),'utf8').includes('Hook validation successful!'));
  const types=name==='issuance'?[0]:name==='claim'?[47,95]:name==='burn'?[46]:[0,99];const {hookMask}=require('./masks.cjs');const on=hookMask(types);
  return{name,position,proof,hook:{CreateCode:code.toString('hex').toUpperCase(),HookNamespace:previous.namespace,HookOn:on,HookCanEmit:hookMask(name==='issuance'?[0,45,48]:[]),HookApiVersion:0,Flags:name==='burn'?5:1}};
 });
 const c=new Client(previous.rpc);try{
  await c.connect();assert.equal(c.networkID,21338);const account=previous.treasury,current=await hooks(c,account);assert.deepEqual(current.map(s=>s.Hook.HookHash),previous.handlers.map(h=>h.hash),'Installed baseline differs');
  const info=(await c.request({command:'account_info',account,ledger_index:'validated'})).result;assert.equal(info.account_flags.tshCollect,true,'Treasury collect flag must be enabled before upgrading');
  const before=await state(c,account,previous.namespace);save('before-state',before);save('before-manifest',previous);
  // New standard tags must not collide with older custom descriptors. Do not silently migrate user records.
  const aliases=before.filter(e=>{const b=Buffer.from(e.value,'hex');return b.length>32&&b.length<=72&&['display','mail','phone'].includes(b.subarray(32).toString('utf8'));});assert.equal(aliases.length,0,'Legacy custom Global Keys need owner-approved migration before this upgrade');
  const tx=await c.autofill({TransactionType:'SetHook',Account:account,NetworkID:21338,Hooks:artifacts.map(a=>{const prior=previous.handlers.find(h=>h.position===a.position);const unchanged=prior?.sha256===a.proof.sha256&&prior.hookOn===a.hook.HookOn&&prior.hookCanEmit===a.hook.HookCanEmit;return{Hook:unchanged?{}:a.hook};})});assert(BigInt(tx.Fee)<=40000000n,'SetHook fee exceeds testnet deployment cap');
  const simulation=await c.simulate({...tx,SigningPubKey:''});save('simulation',simulation);assert.equal(simulation.result.engine_result??simulation.result.meta?.TransactionResult,'tesSUCCESS');
  const nodes=simulation.result.meta.AffectedNodes.map(n=>n.CreatedNode??n.ModifiedNode).filter(Boolean);
  for(const a of artifacts){const n=nodes.find(n=>n.LedgerEntryType==='HookDefinition'&&(n.NewFields??n.FinalFields).CreateCode===a.hook.CreateCode);if(n){a.hash=(n.NewFields??n.FinalFields).HookHash;a.definitionIndex=n.LedgerIndex;}else{const prior=previous.handlers.find(h=>h.sha256===a.proof.sha256);assert(prior,'Simulation omitted unknown definition '+a.name);const existing=(await c.request({command:'ledger_entry',index:prior.definitionIndex,ledger_index:'validated'})).result.node;assert.equal(existing.CreateCode,a.hook.CreateCode);assert.equal(existing.HookHash,prior.hash);a.hash=prior.hash;a.definitionIndex=prior.definitionIndex;}}
  save('artifacts',artifacts.map(a=>({name:a.name,position:a.position,...a.proof,hash:a.hash,definitionIndex:a.definitionIndex})));
  if(checkOnly){console.log(JSON.stringify({result:'SIMULATION_PASS',feeDrops:tx.Fee,handlers:artifacts.length,stateEntries:before.length}));return;}
  const env=environment(path.join(__dirname,'.env.local'));assert.equal(env.XAHAU_NETWORK,'testnet');assert.equal(env.XAHAU_TESTNET_WS,previous.rpc);const wallet=Wallet.fromSeed(env.XAHAU_TESTNET_SEED);assert.equal(wallet.classicAddress,account);
  const signed=wallet.sign(tx);save('submission',{hash:signed.hash,transaction:tx});console.log(JSON.stringify({stage:'SetHook',hash:signed.hash,feeDrops:tx.Fee}));
  const response=await c.submitAndWait(signed.tx_blob);save('receipt',response);assert.equal(response.result.validated,true);assert.equal(response.result.meta.TransactionResult,'tesSUCCESS');
  const installed=await hooks(c,account);assert.equal(installed.length,10);assert.deepEqual(installed.map(s=>s.Hook.HookHash),artifacts.map(a=>a.hash));
  for(const a of artifacts){const node=(await c.request({command:'ledger_entry',index:a.definitionIndex,ledger_index:'validated'})).result.node;for(const k of ['CreateCode','HookNamespace','HookOn','HookCanEmit','HookApiVersion'])assert.equal(installed[a.position].Hook[k]??node[k],a.hook[k]);if(a.name==='burn')assert(((installed[a.position].Hook.Flags??node.Flags)&4)!==0);}
  const after=await state(c,account,previous.namespace);save('after-state',after);assert.deepEqual(after,before,'Unexpected namespace state change during SetHook');
  const manifest={schemaVersion:1,release:'0.3.0',network:'xahau-testnet',networkID:21338,rpc:previous.rpc,treasury:account,namespace:previous.namespace,installTransaction:response.result.hash,installedAt:new Date().toISOString(),profileBatchVersions:[1,2],handlers:artifacts.map(a=>({name:a.name,position:a.position,hash:a.hash,definitionIndex:a.definitionIndex,bytes:a.proof.bytes,sha256:a.proof.sha256,sourceSha256:a.proof.sourceSha256,instructionCounts:a.proof.instructionCounts,hookOn:a.hook.HookOn,hookCanEmit:a.hook.HookCanEmit}))};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');save('installed-manifest',manifest);
  const config={wss:manifest.rpc,treasury:manifest.treasury,namespaceId:manifest.namespace,expectedNetworkId:manifest.networkID,hookHashes:Object.fromEntries(manifest.handlers.map(h=>[h.name,h.hash]))};
  fs.writeFileSync(path.join(repo,'sdk/src/deployments.ts'),"import type {XahauNameConfig} from './types';\n/** Verified public testnet deployment; regenerate only after a validated upgrade. */\nexport const TESTNET:Readonly<XahauNameConfig>=Object.freeze("+JSON.stringify(config,null,2)+");\n/** @deprecated Use TESTNET. The native wire marker remains version 2. */\nexport const TESTNET_V2=TESTNET;\n");
  save('result',{result:'DEPLOYED',transaction:response.result.hash,statePreserved:true,handlers:10});console.log(JSON.stringify({result:'DEPLOYED',transaction:response.result.hash,statePreserved:true,handlers:10}));
 }finally{await c.disconnect();}
}
main().catch(e=>{if(fs.existsSync(out))save('error',{name:e.name,message:e.message});console.error(e.message);process.exitCode=1;});
