// Explicit testnet integration suite. Never runs from the default offline test command.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Wallet}=require('xahau'),sdk=require('../dist'),{XahauNameClient,TESTNET,util,parameters,normalizeContentURI,encodeContentHash}=sdk;
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'hook/build/current',process.env.SDK_LIVE_RUN??'live'),clients=[],journal=[],checks=[];
const resume=process.argv.includes('--resume-failed-purchase'),resumeReconcile=process.argv.includes('--resume-missing-reconcile-destination'),resumeP2Readonly=process.argv.includes('--resume-p2-readonly'),resuming=resume||resumeReconcile||resumeP2Readonly;
const reconcileCheckpoint='reconcile consistent native owner through SDK';let replayChecks=null,stage='setup',started=false;
const readonlyCheckpoint='verified readonly facade and pinned snapshot reuse',resumeAt=resumeP2Readonly?readonlyCheckpoint:reconcileCheckpoint;
const p2=process.argv.includes('--p2'),rpcCounts={};
const deployment=require('../../../deployments/testnet.json');
const totalRequests=()=>Object.values(rpcCounts).reduce((sum,n)=>sum+n,0);
assert([resume,resumeReconcile,resumeP2Readonly].filter(Boolean).length<=1,'Choose one narrowly scoped recovery mode');
assert(!resumeP2Readonly||p2,'P2 readonly checkpoint requires --p2');
assert(/^[a-z0-9-]+$/i.test(path.basename(out))&&path.dirname(out)===path.join(repo,'hook/build/current'),'Invalid live journal directory');
const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
function env(file){return Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));}
async function connect(wallet){const c=new XahauNameClient({...TESTNET,wallet,cacheTtlMs:0});clients.push(c);const request=c.rawClient.request.bind(c.rawClient);c.rawClient.request=async(q,...rest)=>{rpcCounts[q.command]=(rpcCounts[q.command]??0)+1;return request(q,...rest);};const sign=wallet.sign.bind(wallet);wallet.sign=tx=>{assert.equal(tx.NetworkID,21338);assert(BigInt(tx.Fee)<=1000000n);const signed=sign(tx);journal.push({stage,hash:signed.hash,transaction:tx});save('transactions',journal);return signed;};const submit=c.rawClient.submitAndWait.bind(c.rawClient);c.rawClient.submitAndWait=async(...args)=>{const r=await submit(...args);save('tx-'+r.result.hash,r);const row=journal.find(j=>j.hash===r.result.hash);if(row)Object.assign(row,{validated:r.result.validated,result:r.result.meta.TransactionResult});save('transactions',journal);return r;};await c.connect();return c;}
async function step(name,fn){if(replayChecks){if(name===resumeAt)replayChecks=null;else{const prior=replayChecks.get(name);assert(prior?.result==='PASS','Missing completed checkpoint '+name);return prior.value;}}stage=name;const start=Date.now(),before=totalRequests();const value=await fn();checks.push({name,result:'PASS',elapsedMs:Date.now()-start,rpcRequests:totalRequests()-before,value});save('checks',checks);console.log(JSON.stringify({name,result:'PASS',hash:value?.txHash??value?.hash}));return value;}
async function namespaceSnapshot(c){const ledger=(await c.rawClient.request({command:'ledger',ledger_index:'validated',transactions:false})).result;const entries=[],markers=new Set();let marker;do{const r=(await c.rawClient.request({command:'account_namespace',account:TESTNET.treasury,namespace_id:TESTNET.namespaceId,ledger_hash:ledger.ledger_hash,...(marker?{marker}:{})})).result;entries.push(...r.namespace_entries.map(e=>({key:e.HookStateKey,value:e.HookStateData})));marker=r.marker;if(marker){const id=JSON.stringify(marker);assert(!markers.has(id),'Repeated namespace marker');markers.add(id);}}while(marker);return{ledgerHash:ledger.ledger_hash,ledgerIndex:ledger.ledger_index,entries:entries.sort((a,b)=>a.key.localeCompare(b.key))};}
const args=(domain,fields={})=>({...util.splitDomain(domain),...fields});
async function fund(c,wallet,to,amount){const tx=await c.rawClient.autofill({TransactionType:'Payment',Account:wallet.classicAddress,Destination:to,Amount:amount,NetworkID:21338});const r=(await c.rawClient.submitAndWait(wallet.sign(tx).tx_blob)).result;assert.equal(r.validated,true);assert.equal(r.meta.TransactionResult,'tesSUCCESS');return{txHash:r.hash};}
async function simulate(c,wallet,tx,expected,code){const prepared=await c.rawClient.autofill({...tx,Account:wallet.classicAddress,NetworkID:21338}),r=(await c.rawClient.simulate({...prepared,SigningPubKey:''})).result;save('simulation-'+stage.replace(/[^a-z0-9]/gi,'-'),r);assert.equal(r.engine_result??r.meta?.TransactionResult,expected);if(code!==undefined)assert((r.meta.HookExecutions??[]).some(e=>BigInt('0x'+(e.HookExecution.HookReturnCode||'0'))===BigInt(code)));return{simulated:true,result:expected,hookReturnCode:code};}
async function main(){
 assert.equal(process.env.SDK_LIVE_TESTNET,'1');assert.equal(TESTNET.expectedNetworkId,21338);assert.equal(TESTNET.wss,'wss://xahau-test.net');assert(resuming?fs.existsSync(out):!fs.existsSync(out),'Existing live journal: inspect before restarting');fs.mkdirSync(out,{recursive:true});started=true;
 const e=env(path.join(repo,'hook/deploy/.env.local'));assert.equal(e.XAHAU_NETWORK,'testnet');const treasury=Wallet.fromSeed(e.XAHAU_TESTNET_SEED);assert.equal(treasury.classicAddress,TESTNET.treasury);
 let a,b,domain,second;
 if(resuming){
  const plan=JSON.parse(fs.readFileSync(path.join(out,'plan.json'),'utf8')),secrets=env(path.join(repo,plan.secretFile));
  a=Wallet.fromSeed(secrets.OWNER_A_SEED);b=Wallet.fromSeed(secrets.OWNER_B_SEED);({domain,second}=plan);
  assert.equal(a.classicAddress,plan.a);assert.equal(b.classicAddress,plan.b);
  const prior=JSON.parse(fs.readFileSync(path.join(out,'transactions.json'),'utf8'));
  const errorFile=path.join(out,'error.json');
  if(resumeP2Readonly){
   assert(prior.length>3&&prior.every(t=>t.validated&&t.result==='tesSUCCESS'));
   const failure=JSON.parse(fs.readFileSync(errorFile,'utf8'));assert.equal(failure.stage,readonlyCheckpoint);assert.equal(failure.code,'ERR_ASSERTION');
   assert.equal(prior.at(-1).stage,'set primary name');
  }else if(resumeReconcile){
   assert(prior.length>3&&prior.every(t=>t.validated&&t.result==='tesSUCCESS'));
   const last=prior.at(-1),failure=JSON.parse(fs.readFileSync(errorFile,'utf8'));
   assert.equal(last.stage,reconcileCheckpoint);assert.equal(last.transaction.TransactionType,'Invoke');assert.equal(last.transaction.Account,b.classicAddress);assert.equal(last.transaction.Destination,undefined);
   assert.equal(failure.code,'HOOK_NOT_EXECUTED');assert.equal(failure.details.txHash,last.hash);last.sdkError='HOOK_NOT_EXECUTED';
  }else{
   assert.equal(prior.length,3);assert(prior.every(t=>t.validated));assert.equal(prior[2].result,'tecHOOK_REJECTED');assert.equal(prior[2].stage,'purchase domain through SDK');
  }
  journal.push(...prior);checks.push(...JSON.parse(fs.readFileSync(path.join(out,'checks.json'),'utf8')));
  if(resumeReconcile||resumeP2Readonly)replayChecks=new Map(checks.map(c=>[c.name,c]));
  const archive=path.join(out,resumeP2Readonly?'readonly-assertion-error.json':resumeReconcile?'missing-reconcile-destination-error.json':'failed-purchase-error.json');assert(!fs.existsSync(archive),'Prior failure archive already exists');
  if(fs.existsSync(errorFile))fs.renameSync(errorFile,archive);
 }else{
  a=Wallet.generate();b=Wallet.generate();const tag=Date.now().toString(),secret='hook/deploy/.env.release-'+tag+'.local';fs.writeFileSync(path.join(repo,secret),'# Disposable testnet credentials. Never commit.\nOWNER_A_SEED='+a.seed+'\nOWNER_B_SEED='+b.seed+'\n',{flag:'wx'});
  domain='release'+tag.slice(-10)+'.xah';second='manage'+tag.slice(-10)+'.xah';save('plan',{networkID:21338,domain,second,a:a.classicAddress,b:b.classicAddress,secretFile:secret});
 }
 const tc=await connect(treasury),ac=await connect(a),bc=await connect(b);
 let baseline=resumeP2Readonly?JSON.parse(fs.readFileSync(path.join(out,'namespace-before.json'),'utf8')):undefined;
 if(resumeP2Readonly){const last=journal.at(-1),receipt=(await ac.rawClient.request({command:'tx',transaction:last.hash,binary:false})).result;assert.equal(receipt.validated,true);assert.equal(receipt.meta.TransactionResult,'tesSUCCESS');assert.equal(await ac.getOwner(domain),a.classicAddress);assert.equal(await ac.getVerifiedPrimaryName(a.classicAddress),domain);save('resume-readonly-preflight',{hash:last.hash,owner:a.classicAddress,noFundingOrPurchaseReplay:true});}
 if(p2){assert(!resuming||resumeP2Readonly,'P2 resumption needs explicit checkpoint review');await step('verify current installed deployment before writes',async()=>{assert.equal(TESTNET.namespaceId,deployment.namespace);const objects=(await tc.rawClient.request({command:'account_objects',account:TESTNET.treasury,type:'hook',ledger_index:'validated'})).result;assert(!objects.marker);const hooks=objects.account_objects.flatMap(o=>o.Hooks??[]);assert.equal(hooks.length,deployment.handlers.length);for(const h of deployment.handlers)assert.equal(hooks[h.position].Hook.HookHash,h.hash);baseline=await namespaceSnapshot(tc);save('namespace-before',baseline);return{installTransaction:deployment.installTransaction,hooks:hooks.length,namespaceEntries:baseline.entries.length,ledgerHash:baseline.ledgerHash};});}
 if(resumeReconcile){
  const last=journal.at(-1),r=(await bc.rawClient.request({command:'tx',transaction:last.hash,binary:false})).result,tx=r.tx_json??r;
  assert.equal(r.validated,true);assert.equal(r.meta.TransactionResult,'tesSUCCESS');assert.equal(tx.TransactionType,'Invoke');assert.equal(tx.Account,b.classicAddress);assert.equal(tx.Destination,undefined);assert.equal(tx.NetworkID,21338);
  assert.equal((r.meta.HookExecutions??[]).length,0);assert(!r.meta.AffectedNodes.some(n=>['HookState','URIToken'].includes((n.CreatedNode??n.ModifiedNode??n.DeletedNode).LedgerEntryType)));
  assert.equal(await ac.getOwner(domain),a.classicAddress);save('resume-reconcile-preflight',{hash:last.hash,validated:true,noHookOrDomainChanges:true,owner:a.classicAddress});
 }
 if(!resuming){await step('fund fresh wallet A',()=>fund(tc,treasury,a.classicAddress,'50000000'));await step('fund fresh wallet B',()=>fund(tc,treasury,b.classicAddress,'30000000'));}
 await step('purchase domain through SDK',()=>ac.registrar.buy(args(domain)));if(!resumeReconcile&&!resumeP2Readonly)await ac.registrar.waitForOffer(domain,{timeoutMs:90000});
 await step('discover pending registration',async()=>{const result=await ac.listIncomingDomains(a.classicAddress);assert.equal(result.offers.find(o=>o.domain===domain)?.kind,'registration');return result;});
 await step('claim purchased domain',()=>ac.registrar.claimIncoming(domain));
 const profile={avatar:'https://example.com/avatar.png',description:'Testnet domain profile',display:domain[0].toUpperCase()+domain.slice(1),email:'owner@example.com',keywords:'xahau, testnet',mail:'Testnet Avenue',notice:'Test assets only',location:'Ho Chi Minh City',phone:'+84901234567',url:'https://example.com'};
 let count=journal.length;const full=await step('save all ten Global Keys with one Invoke',()=>ac.resolver.setProfile(args(domain,{set:profile})));if(!resumeReconcile&&!resumeP2Readonly)assert.equal(journal.length,count+1);assert.equal(full.hookReturnString,'profile set');
 await step('read complete verified profile and identity',async()=>{const result=await ac.describe(domain,{verifyOwner:true,bypassCache:true});assert.equal(result.owner,a.classicAddress);for(const[k,v]of Object.entries(profile))assert.equal(result.texts[k],v);assert.equal(result.locked,false);const base=await ac.registrar.getURIBase();assert.equal(await ac.registrar.getTokenURI(domain),base+domain);assert.equal((await ac.registrar.getRegistrationStatus(domain)).stage,'claimed');return result;});
 await step('unchanged profile does not request a signature',async()=>{const n=journal.length;assert.equal(await ac.resolver.setProfile(args(domain,{set:profile})),null);assert.equal(journal.length,n);return{signatures:0};});
 await step('patch and clear profile atomically',()=>ac.resolver.setProfile(args(domain,{set:{description:'Updated bio'},clear:['mail','notice']})));
 await step('store custom key',()=>ac.resolver.setText(args(domain,{key:'custom.project',value:'website integration'})));
 await step('store service key',()=>ac.resolver.setText(args(domain,{key:'com.github',value:'xrpdomains'})));
 const addresses=[[21337,a.classicAddress],[144,b.classicAddress],[0,'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],[60,'0x314159265dD8dbb310642f98f50C066173C1259b'],[501,'11111111111111111111111111111111'],[195,'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb']];
 for(const[coinType,address]of addresses)await step('set receiving address '+coinType,()=>ac.resolver.setAddress(args(domain,{coinType,address})));
 await step('resolve each receiving network independently',async()=>{const values={};for(const[coin,address]of addresses){const value=await ac.resolver.resolveAddress(domain,coin);assert.deepEqual(sdk.encodeAddress(coin,value),sdk.encodeAddress(coin,address));values[coin]=value;}return values;});
 await step('clear receiving address',()=>ac.resolver.clearAddr(args(domain,{coinType:0})));
 await step('set primary name',()=>ac.resolver.setPrimary(args(domain,{flag:true})));
 await step('verify primary round trip',async()=>{assert.equal(await ac.getPrimaryName(a.classicAddress),domain);assert.equal(await ac.getVerifiedPrimaryName(a.classicAddress),domain);return{domain,verified:true};});
 if(p2)await step('verified readonly facade and pinned snapshot reuse',async()=>{const session=await ac.read.snapshot();assert.equal(await session.getOwner({name:domain}),a.classicAddress);assert.equal(await session.getAddress({name:domain,coinType:21337}),a.classicAddress);assert.equal(await session.getName({address:a.classicAddress,name:domain}),domain);const records=await session.getRecords({name:domain,addresses:[21337,60],texts:['description','custom.project','com.github']});assert.equal(records.texts.description,'Updated bio');assert.equal(records.texts['custom.project'],'website integration');assert.equal(records.addresses[21337].value,a.classicAddress);assert.equal(records.complete,false);assert.equal((await session.getDomain({name:domain})).stage,'claimed');assert((await session.getNames({address:a.classicAddress})).items.some(item=>item.domain===domain));const before=totalRequests();assert.equal(await session.getOwner({name:domain}),a.classicAddress);assert.equal(totalRequests(),before,'Repeated pinned owner read should reuse snapshot');return records;});
 await step('change native receiving record',()=>ac.resolver.setAddress(args(domain,{coinType:21337,address:b.classicAddress})));
 await step('mismatched forward address invalidates verified primary',async()=>{assert.equal(await ac.getPrimaryName(a.classicAddress),domain);assert.equal(await ac.getVerifiedPrimaryName(a.classicAddress),null);return{configured:domain,verified:null};});
 await step('restore native receiving record',()=>ac.resolver.setAddress(args(domain,{coinType:21337,address:a.classicAddress})));
 const content='ipfs://QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4';
 await step('set website content through text record',()=>ac.resolver.setContentURI(args(domain,{uri:content})));
 await step('read content URI and ENSIP-7 codec',async()=>{assert.equal(await ac.resolver.getContentURI(domain),normalizeContentURI(content));assert.deepEqual(await ac.resolver.getContentHash(domain),encodeContentHash(content));return{uri:normalizeContentURI(content)};});
 await step('resolve profile avatar',async()=>{const result=await ac.getAvatar(domain);assert.equal(result.source,'avatar');assert.equal(result.uri,profile.avatar);return result;});
 const beforeReconcile=await ac.describe(domain,{verifyOwner:true,bypassCache:true});
 await step('reconcile consistent native owner through SDK',()=>bc.registrar.reconcile(domain));
 await step('consistent reconciliation preserves profile and primary',async()=>{const result=await ac.describe(domain,{verifyOwner:true,bypassCache:true});assert.deepEqual(result,beforeReconcile);assert.equal(await ac.getVerifiedPrimaryName(a.classicAddress),domain);return{owner:result.owner,recordsPreserved:true,primaryPreserved:true};});
 await step('raw lock Invoke rejects',()=>simulate(ac,a,{TransactionType:'Invoke',Destination:TESTNET.treasury,HookParameters:parameters('lock',sdk.domainFields(...Object.values(util.splitDomain(domain))))},'tecHOOK_REJECTED',4));
 const token=await ac.registrar.getTokenId(domain);
 await step('Remit cannot bypass owner cleanup',()=>simulate(ac,a,{TransactionType:'Remit',Destination:b.classicAddress,URITokenIDs:[token]},'tecHOOK_REJECTED',65));
 await step('nonowner record Invoke rejects',()=>simulate(bc,b,{TransactionType:'Invoke',Destination:TESTNET.treasury,HookParameters:parameters('setText',{...sdk.domainFields(...Object.values(util.splitDomain(domain))),key:Buffer.from('description'),value:Buffer.from('blocked')})},'tecHOOK_REJECTED',12));
 await step('create transfer offer',()=>ac.registrar.createTransferOffer(domain,b.classicAddress));
 await step('recipient discovers offered domain',async()=>{assert.equal((await bc.listIncomingDomains(b.classicAddress)).offers.find(o=>o.domain===domain)?.kind,'transfer');return{incoming:true};});
 await step('cancel transfer offer',()=>ac.registrar.cancelTransferOffer(domain));
 await step('cancelled offer disappears',async()=>{assert(!(await bc.listIncomingDomains(b.classicAddress)).offers.some(o=>o.domain===domain));return{incoming:false};});
 await step('recreate transfer offer',()=>ac.registrar.createTransferOffer(domain,b.classicAddress));await step('recipient claims transfer',()=>bc.registrar.claimIncoming(domain));
 await step('transfer clears every profile record and old primary',async()=>{const result=await bc.describe(domain,{verifyOwner:true,bypassCache:true});assert.equal(result.owner,b.classicAddress);assert.deepEqual(result.texts,{});assert.deepEqual(result.addrs,{});assert.equal(await ac.getPrimaryName(a.classicAddress),null);assert.equal(await bc.resolver.getContentURI(domain),null);assert(!(await ac.listOwnedDomains(a.classicAddress)).includes(domain));assert((await bc.listOwnedDomains(b.classicAddress)).includes(domain));return result;});
 await step('recipient writes profile',()=>bc.resolver.setProfile(args(domain,{set:{description:'New owner profile'}})));
 await step('recipient writes website content',()=>bc.resolver.setContentURI(args(domain,{uri:content})));
 await step('burn domain',()=>bc.registrar.burn(domain));
 await step('burn removes identity and records',async()=>{assert.equal(await bc.describe(domain),null);assert.equal(await bc.resolver.getText(domain,'contenthash'),null);assert.equal((await bc.registrar.getRegistrationStatus(domain)).stage,'available');return{removed:true};});
 await step('reconcile completed burn through SDK',()=>ac.registrar.reconcile(domain));
 await step('repeat completed burn reconciliation safely',()=>bc.registrar.reconcile(domain));
 await step('completed burn stays available after reconciliation',async()=>{assert.equal((await ac.registrar.getRegistrationStatus(domain)).stage,'available');assert.equal(await ac.describe(domain),null);return{available:true};});
 if(p2){await step('buy burned name for a new lifecycle',()=>ac.registrar.buy(args(domain)));await ac.registrar.waitForOffer(domain,{timeoutMs:90000});await step('reclaim previously burned name',()=>ac.registrar.claimIncoming(domain));await step('remint inherits no profile address custom text or primary',async()=>{const result=await ac.describe(domain,{verifyOwner:true,bypassCache:true});assert.equal(result.owner,a.classicAddress);assert.deepEqual(result.texts,{});assert.deepEqual(result.addrs,{});assert.equal(await ac.getPrimaryName(a.classicAddress),null);assert.equal((await ac.registrar.getRegistrationStatus(domain)).stage,'claimed');return result;});await step('cleanup reissued domain',()=>ac.registrar.burn(domain));}
 await step('treasury registers a second domain',()=>tc.registrar.register(args(second,{recipient:a.classicAddress})));await ac.registrar.waitForOffer(second,{timeoutMs:90000});await step('claim registered domain',()=>ac.registrar.claim(second));
 await step('set second domain custom text',()=>ac.resolver.setText(args(second,{key:'custom.reset',value:'remove on reset'})));await step('set second domain content',()=>ac.resolver.setContentURI(args(second,{uri:content})));
 await step('reset clears content and custom text',()=>ac.resolver.reset(args(second)));
 await step('verify reset state',async()=>{const result=await ac.describe(second,{verifyOwner:true});assert.deepEqual(result.texts,{});assert.deepEqual(result.addrs,{});return result;});
 await step('cleanup second domain',()=>ac.registrar.burn(second));
 const smoke=await step('noop Payment smoke',async()=>{const tx=await ac.rawClient.autofill({TransactionType:'Payment',Account:a.classicAddress,Destination:TESTNET.treasury,Amount:'1',NetworkID:21338}),r=(await ac.rawClient.submitAndWait(a.sign(tx).tx_blob)).result;assert.equal(r.validated,true);assert.equal(r.meta.TransactionResult,'tesSUCCESS');assert(r.meta.HookExecutions.length>0);assert(r.meta.HookExecutions.every(e=>BigInt('0x'+e.HookExecution.HookReturnCode)===0n));return{txHash:r.hash,hookExecutions:r.meta.HookExecutions};});
 if(p2)await step('namespace exactly restored after lifecycle cleanup',async()=>{const after=await namespaceSnapshot(tc);save('namespace-after',after);assert.deepEqual(after.entries,baseline.entries,'Non-test state changed or test records remain; inspect snapshots before further writes');return{beforeEntries:baseline.entries.length,afterEntries:after.entries.length,ledgerHash:after.ledgerHash};});
 const summary={release:'0.3.0',networkID:21338,result:'PASS',installTransaction:deployment.installTransaction,checks:checks.length,transactions:journal.length,rpcCounts,rpcCountsScope:resuming?'resume process only; completed steps retain their own RPC counts':'complete process',harnessCheckpointResumed:resumeP2Readonly,validatedTransactions:journal.filter(t=>t.validated&&t.result==='tesSUCCESS').length,ownerA:a.classicAddress,ownerB:b.classicAddress,domains:[domain,second],cleanup:'both domains burned',resolvedSdkIssues:journal.filter(t=>t.sdkError).map(t=>({action:t.stage,hash:t.hash,code:t.sdkError,engineResult:t.result})),profileSaveTransaction:full.txHash,smokeTransaction:smoke.txHash,transactionsByAction:journal.map(t=>({action:t.stage,hash:t.hash,result:t.result,...(t.sdkError?{sdkError:t.sdkError}:{})}))};save('summary',summary);fs.writeFileSync(path.join(repo,p2?'deployments/testnet-p2-validation.json':'deployments/testnet-validation.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}
main().catch(e=>{if(started)save('error',{stage,name:e.name,code:e.code,message:e.message,details:e.details});console.error(stage+': '+e.message);process.exitCode=1;}).finally(async()=>{for(const c of clients)try{await c.disconnect();}catch{}});
