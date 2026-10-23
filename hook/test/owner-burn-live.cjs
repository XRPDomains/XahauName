// Explicit two-phase testnet regression. Never targets an existing user domain.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Wallet}=require('xahau'),{XahauNameClient,util}=require('../../packages/sdk/dist');
const repo=path.resolve(__dirname,'../..'),manifest=JSON.parse(fs.readFileSync(path.join(repo,'deployments/testnet.json')));
const run=process.env.OWNER_BURN_RUN,phase=process.argv[2],clients=[];
assert.equal(process.env.OWNER_BURN_TESTNET,'1');assert(/^[a-z0-9-]+$/i.test(run??''));assert(['before','after'].includes(phase));
assert.equal(manifest.networkID,21338);assert.equal(manifest.rpc,'wss://xahau-test.net');
const out=path.join(repo,'hook/build/current',run),save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
const receipt=r=>({txHash:r.txHash,result:r.engineResult??r.result,...(r.hookReturnCode===undefined?{}:{hookReturnCode:r.hookReturnCode,hookReturnString:r.hookReturnString}),hookExecutions:r.hookExecutions.map(e=>e.HookExecution??{account:e.account,hash:e.hash,returnCode:e.returnCode,returnString:e.returnString})});
function env(file){return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));}
let stage='setup',journal=[];
async function connect(wallet){
 const c=new XahauNameClient({wss:manifest.rpc,treasury:manifest.treasury,namespaceId:manifest.namespace,expectedNetworkId:manifest.networkID,hookHashes:Object.fromEntries(manifest.handlers.map(h=>[h.name,h.hash])),wallet,cacheTtlMs:0});
 const sign=wallet.sign.bind(wallet);wallet.sign=tx=>{
  assert.equal(tx.NetworkID,21338);assert(BigInt(tx.Fee)<=1000000n);
  const signed=sign(tx);journal.push({stage,hash:signed.hash,transaction:tx});save('transactions',journal);return signed;
 };
 clients.push(c);await c.connect();return c;
}
async function step(name,fn){stage=name;const r=await fn();save(name,r);console.log(JSON.stringify({stage,...(r?.txHash?{hash:r.txHash}:{})}));return r;}
async function namespace(c){let marker;const entries=[];do{const r=(await c.rawClient.request({command:'account_namespace',account:manifest.treasury,namespace_id:manifest.namespace,ledger_index:'validated',...(marker?{marker}:{})})).result;entries.push(...r.namespace_entries.map(e=>({key:e.HookStateKey,value:e.HookStateData})));marker=r.marker;}while(marker);return entries.sort((a,b)=>a.key.localeCompare(b.key));}
async function send(c,w,tx,expected='tesSUCCESS'){
 const prepared=await c.rawClient.autofill({...tx,Account:w.classicAddress,NetworkID:21338});
 const signed=w.sign(prepared),r=(await c.rawClient.submitAndWait(signed.tx_blob,{failHard:false})).result;
 save('tx-'+signed.hash,r);assert.equal(r.validated,true);assert.equal(r.meta.TransactionResult,expected);
 Object.assign(journal.find(j=>j.hash===signed.hash),{validated:true,result:r.meta.TransactionResult});save('transactions',journal);
 return {txHash:signed.hash,result:r.meta.TransactionResult,hookExecutions:r.meta.HookExecutions??[]};
}
async function simulate(c,w,id,expected,code){
 const tx=await c.rawClient.autofill({TransactionType:'URITokenBurn',URITokenID:id,Account:w.classicAddress,NetworkID:21338});
 const r=(await c.rawClient.simulate({...tx,SigningPubKey:''})).result;
 save('simulation-'+stage,r);assert.equal(r.engine_result??r.meta?.TransactionResult,expected);
 if(code!==undefined)assert((r.meta.HookExecutions??[]).some(e=>BigInt('0x'+e.HookExecution.HookReturnCode)===BigInt(code)));
 return {result:expected,hookReturnCode:code};
}
async function main(){
 const secrets=env(path.join(repo,'hook/deploy/.env.local')),treasury=Wallet.fromSeed(secrets.XAHAU_TESTNET_SEED);
 assert.equal(secrets.XAHAU_NETWORK,'testnet');assert.equal(treasury.classicAddress,manifest.treasury);
 let a,b,plan;
 if(phase==='before'){
  assert(!fs.existsSync(out),'Existing journal: inspect receipts before continuing');fs.mkdirSync(out);
  a=Wallet.generate();b=Wallet.generate();const secretFile='hook/deploy/.env.'+run+'.local';
  assert.equal(require('node:child_process').spawnSync('git',['check-ignore',secretFile],{cwd:repo}).status,0,'Secrets must be ignored');
  fs.writeFileSync(path.join(repo,secretFile),'# Disposable testnet wallets. Never commit.\nOWNER_A_SEED='+a.seed+'\nOWNER_B_SEED='+b.seed+'\n',{flag:'wx'});
  plan={domain:'ownerburn'+Date.now().toString().slice(-10)+'.xah',a:a.classicAddress,b:b.classicAddress,secretFile,beforeInstall:manifest.installTransaction};save('plan',plan);
 }else{
  plan=JSON.parse(fs.readFileSync(path.join(out,'plan.json')));assert.notEqual(manifest.installTransaction,plan.beforeInstall);
  assert(fs.existsSync(path.join(out,'before-complete.json')));assert(!fs.existsSync(path.join(out,'after-started.json')),'After phase already started: inspect receipts');
  const s=env(path.join(repo,plan.secretFile));a=Wallet.fromSeed(s.OWNER_A_SEED);b=Wallet.fromSeed(s.OWNER_B_SEED);
  journal=JSON.parse(fs.readFileSync(path.join(out,'transactions.json')));save('after-started',{installTransaction:manifest.installTransaction});
 }
 const tc=await connect(treasury),ac=await connect(a),bc=await connect(b),domain=plan.domain,args=util.splitDomain(domain);
 if(phase==='before'){
  save('before-state',await namespace(tc));
  await step('fund-a',()=>send(tc,treasury,{TransactionType:'Payment',Destination:a.classicAddress,Amount:'30000000'}));
  await step('fund-b',()=>send(tc,treasury,{TransactionType:'Payment',Destination:b.classicAddress,Amount:'30000000'}));
  await step('register',()=>tc.registrar.register({...args,recipient:a.classicAddress}));
  await ac.registrar.waitForOffer(domain,{timeoutMs:90000});
  await step('claim',()=>ac.registrar.claimIncoming(domain));
  const id=await ac.registrar.getTokenId(domain);save('identity',{domain,id,owner:await ac.getOwner(domain)});
  await step('issuer-before',()=>simulate(tc,treasury,id,'tesSUCCESS'));
  assert.equal(await ac.getOwner(domain),a.classicAddress);save('before-complete',{domain,id,result:'VULNERABILITY_REPRODUCED_BY_SIMULATION'});
  return;
 }
 const {id}=JSON.parse(fs.readFileSync(path.join(out,'identity.json')));
 assert.equal(await ac.getOwner(domain),a.classicAddress);
 await step('issuer-after',()=>simulate(tc,treasury,id,'tecHOOK_REJECTED',12));
 await step('issuer-denied',()=>send(tc,treasury,{TransactionType:'URITokenBurn',URITokenID:id},'tecHOOK_REJECTED'));
 assert.equal(await ac.getOwner(domain),a.classicAddress);
 await step('remit-denied',async()=>{
  const tx=await ac.rawClient.autofill({TransactionType:'Remit',Account:a.classicAddress,Destination:b.classicAddress,URITokenIDs:[id],NetworkID:21338});
  const r=(await ac.rawClient.simulate({...tx,SigningPubKey:''})).result;save('simulation-remit',r);
  assert.equal(r.engine_result??r.meta?.TransactionResult,'tecHOOK_REJECTED');
  assert((r.meta.HookExecutions??[]).some(e=>BigInt('0x'+e.HookExecution.HookReturnCode)===65n));
  return {result:'tecHOOK_REJECTED',hookReturnCode:65};
 });
 await step('set-profile',()=>ac.resolver.setProfile({...args,set:{description:'Owner burn regression'}}));
 await step('set-custom',()=>ac.resolver.setText({...args,key:'custom.ownerburn',value:'reset after transfer'}));
 await step('set-primary',()=>ac.resolver.setPrimary({...args,flag:true}));
 await step('transfer-offer',()=>ac.registrar.createTransferOffer(domain,b.classicAddress));
 await step('transfer-claim',()=>bc.registrar.claimIncoming(domain));
 assert.equal(await bc.getOwner(domain),b.classicAddress);assert.equal(await ac.getPrimaryName(a.classicAddress),null);
 const profile=await bc.describe(domain,{verifyOwner:true,bypassCache:true});assert.deepEqual(profile.texts,{});save('transfer-profile',profile);
 await step('issuer-after-transfer',()=>simulate(tc,treasury,id,'tecHOOK_REJECTED',12));
 await step('old-owner-denied',()=>simulate(ac,a,id,'tecNO_PERMISSION'));
 await step('new-owner-custom',()=>bc.resolver.setText({...args,key:'custom.ownerburn',value:'reset after burn'}));
 const burn=await step('owner-burn',()=>bc.registrar.burn(domain));
 assert.equal(await bc.describe(domain,{bypassCache:true}),null);
 assert.equal((await bc.registrar.getRegistrationStatus(domain)).stage,'available');
 const after=await namespace(tc);save('after-state',after);assert.deepEqual(after,JSON.parse(fs.readFileSync(path.join(out,'before-state.json'))),'Unexpected namespace difference');
 const summary={networkID:21338,verifiedAt:new Date().toISOString(),result:'PASS',domain,installTransaction:manifest.installTransaction,beforeIssuerBurnSimulation:'tesSUCCESS',issuerDenied:receipt(JSON.parse(fs.readFileSync(path.join(out,'issuer-denied.json')))),remitBypassRejected:true,transferClaim:receipt(JSON.parse(fs.readFileSync(path.join(out,'transfer-claim.json')))),oldOwnerBurnRejected:'tecNO_PERMISSION',ownerBurn:receipt(burn),stateRestored:true};
 save('summary',summary);fs.writeFileSync(path.join(repo,'deployments/testnet-owner-burn-validation.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',domain,ownerBurn:burn.txHash,stateRestored:true}));
}
main().catch(e=>{if(fs.existsSync(out))save('error-'+phase,{stage,message:e.message,code:e.code});console.error(stage+': '+e.message);process.exitCode=1;}).finally(async()=>{for(const c of clients)try{await c.disconnect();}catch{}});
