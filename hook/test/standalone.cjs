// Explicit isolated-node integration. Never connects to a public network or reads private env files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Client,Wallet,decodeAccountID}=require('xahau');
const {XahauNameClient,util,parameters}=require('../../packages/sdk/dist');
const {hookMask}=require('../deploy/masks.cjs');
const repo=path.resolve(__dirname,'../..'),base=path.join(repo,'hook/build/current');
async function main(){
 assert.equal(process.env.XAHAUNAME_STANDALONE,'1','Explicit standalone authorization required');
 const endpoint='ws://127.0.0.1:26006',networkID=65535;
 const name=process.env.STANDALONE_RUN;assert(name&&/^[a-z0-9-]+$/.test(name),'Fresh standalone journal name required');
 const out=path.join(base,name);assert(!fs.existsSync(out),'Never replay an existing transaction journal');fs.mkdirSync(out);
 const save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
 const rpc=new Client(endpoint,{connectionTimeout:3000,timeout:10000}),clients=[],checks=[],transactions=[];
 let stage='preflight';const report={networkID,endpoint,result:'IN_PROGRESS',checks,transactions};
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 async function close(n=1){for(let i=0;i<n;i++)await rpc.request({command:'ledger_accept'});}
 async function submit(wallet,tx,expected='tesSUCCESS'){
  const prepared=await rpc.autofill({...tx,Account:wallet.classicAddress,NetworkID:networkID});
  assert.equal(prepared.NetworkID,networkID);assert(BigInt(prepared.Fee)<=50000000n,'Local fee cap');
  const signed=wallet.sign(prepared);transactions.push({stage,hash:signed.hash,transaction:prepared});save('journal',transactions);
  const accepted=(await rpc.submit(signed.tx_blob)).result;
  assert(['tesSUCCESS','terQUEUED',expected].includes(accepted.engine_result),'Submission: '+accepted.engine_result);
  await close();const receipt=(await rpc.request({command:'tx',transaction:signed.hash})).result;
  save('tx-'+signed.hash,receipt);assert.equal(receipt.validated,true);assert.equal(receipt.meta.TransactionResult,expected);
  Object.assign(transactions.at(-1),{validated:true,result:receipt.meta.TransactionResult});save('journal',transactions);
  return{txHash:signed.hash,engineResult:receipt.meta.TransactionResult,meta:receipt.meta,validated:true};
 }
 async function step(name,fn){stage=name;const value=await fn();checks.push({name,result:'PASS',value});save('checks',checks);console.log(JSON.stringify({name,result:'PASS'}));return value;}
 try{
  await rpc.connect();assert.equal(rpc.networkID,networkID);
  const info=(await rpc.request({command:'server_info'})).result.info;assert.equal(info.server_state,'full');
  const features=(await rpc.request({command:'feature'})).result.features;
  for(const name of ['Hooks','URIToken','HooksUpdate2','HookCanEmit','NamedHooks'])assert(Object.values(features).some(x=>x.name===name&&x.enabled),'Missing amendment '+name);
  save('node',{info,features});report.buildVersion=info.build_version;
  // Public standalone genesis entropy; never uses a testnet/mainnet account or stored seed.
  const genesis=Wallet.fromEntropy(crypto.createHash('sha512').update('masterpassphrase').digest().subarray(0,16),{algorithm:'secp256k1'});
  assert.equal(genesis.classicAddress,'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
  const treasury=Wallet.generate(),a=Wallet.generate(),b=Wallet.generate();
  report.accounts={treasury:treasury.classicAddress,a:a.classicAddress,b:b.classicAddress};
  for(const wallet of [treasury,a,b])await step('fund '+wallet.classicAddress,()=>submit(genesis,{TransactionType:'Payment',Destination:wallet.classicAddress,Amount:'1000000000'}));
  await step('enable collect',()=>submit(treasury,{TransactionType:'AccountSet',SetFlag:11}));
  const manifest=require('../../deployments/testnet.json'),parts=require('../config/handlers.json');
  const artifacts=parts.map(name=>{const dir=path.join(base,name),proof=JSON.parse(fs.readFileSync(path.join(dir,'proof.json'))),code=fs.readFileSync(path.join(dir,'xahau-name-hook.cleaned.wasm'));
   assert.equal(hash(code),proof.sha256);assert(proof.guardPassed);assert.equal(hash(Buffer.concat([fs.readFileSync(path.join(repo,'hook/src/common.h')),fs.readFileSync(path.join(repo,'hook/src/handlers',name+'.c'))])),proof.sourceSha256);
   assert.equal(manifest.handlers.find(x=>x.name===name).sha256,proof.sha256,'Use exact installed production bytes');
   return{Hook:{CreateCode:code.toString('hex').toUpperCase(),HookNamespace:manifest.namespace,HookOn:hookMask(name==='issuance'?[0]:name==='claim'?[47,95,99]:name==='burn'?[46]:[0,99]),HookCanEmit:hookMask(name==='issuance'?[0,45,48]:[]),HookApiVersion:0,Flags:name==='burn'?5:1}};});
  await step('install production artifacts',()=>submit(treasury,{TransactionType:'SetHook',Hooks:artifacts}));
  const installed=(await rpc.request({command:'account_objects',account:treasury.classicAddress,type:'hook',ledger_index:'validated'})).result.account_objects.flatMap(x=>x.Hooks??[]);
  assert.equal(installed.length,10);
  const config={wss:endpoint,treasury:treasury.classicAddress,namespaceId:manifest.namespace,expectedNetworkId:networkID,hookHashes:Object.fromEntries(parts.map((name,i)=>[name,installed[i].Hook.HookHash])),cacheTtlMs:0,maxFeeXAH:'50'};
  function client(wallet){const c=new XahauNameClient({...config,signer:{address:wallet.classicAddress,signAndSubmit:tx=>submit(wallet,tx)}});clients.push(c);return c;}
  const tc=client(treasury),ac=client(a),bc=client(b);for(const c of clients)await c.connect();
  await step('set pricing',()=>tc.registrar.setPricing(Array(10).fill(1000000n)));
  await step('set URI base',()=>tc.registrar.setURIBase('https://example.com/metadata/'));
  const domain='standalone.xah',args={label:'standalone',tld:'xah'};
  await step('buy',()=>ac.registrar.buy(args));
  await close(8);
  await step('mint and offer callbacks leave pending awaiting claim',async()=>{const s=await ac.registrar.getRegistrationStatus(domain);assert.equal(s.stage,'awaitingClaim');assert.equal(s.tokenOwner,treasury.classicAddress);return s;});
  await step('claim',()=>ac.registrar.claimIncoming(domain));
  await step('set custom text',()=>ac.resolver.setText({...args,key:'custom.native',value:'must clear'}));
  await step('set address',()=>ac.resolver.setAddr({...args,coinType:21337,addr:Buffer.from(decodeAccountID(a.classicAddress))}));
  await step('transfer offer',()=>ac.registrar.createTransferOffer(domain,b.classicAddress));
  await step('transfer claim',()=>bc.registrar.claimIncoming(domain));
  await step('transfer cleanup',async()=>{const p=await bc.describe(domain);assert.equal(p.owner,b.classicAddress);assert.deepEqual(p.texts,{});assert.deepEqual(p.addrs,{});return{owner:p.owner};});
  await step('burn',()=>bc.registrar.burn(domain));
  await step('burn cleanup',async()=>{assert.equal(await bc.describe(domain),null);return{absent:true};});
  await step('reconcile twice',async()=>{await ac.registrar.reconcile(domain);await ac.registrar.reconcile(domain);return{idempotent:true};});
  if(process.env.STANDALONE_FAULTS==='1'){
   const hooks=parts.map(part=>{if(!['claim','burn'].includes(part))return{Hook:{}};
    const dir=path.join(base,'native-fault-artifacts',part),proof=JSON.parse(fs.readFileSync(path.join(dir,'proof.json'))),code=fs.readFileSync(path.join(dir,'xahau-name-hook.cleaned.wasm'));
    assert.equal(proof.testOnly,true);assert.equal(proof.guardPassed,true);assert.equal(hash(code),proof.sha256);assert.equal(hash(fs.readFileSync(path.join(repo,'hook/src/common.h'))),proof.productionCommonSha256);
    return{Hook:{...artifacts[parts.indexOf(part)].Hook,CreateCode:code.toString('hex').toUpperCase()}};});
   await step('install test-only fault handlers',()=>submit(treasury,{TransactionType:'SetHook',Hooks:hooks}));
   const slots=(await rpc.request({command:'account_objects',account:treasury.classicAddress,type:'hook',ledger_index:'validated'})).result.account_objects.flatMap(x=>x.Hooks??[]);
   for(const part of ['claim','burn'])config.hookHashes[part]=slots[parts.indexOf(part)].Hook.HookHash;
   async function namespace(){const values=[],seen=new Set();let marker;do{const r=(await rpc.request({command:'account_namespace',account:treasury.classicAddress,namespace_id:manifest.namespace,ledger_index:'validated',...(marker?{marker}:{})})).result;values.push(...r.namespace_entries.map(e=>[e.HookStateKey,e.HookStateData]));marker=r.marker;if(marker){const encoded=JSON.stringify(marker);assert(!seen.has(encoded));seen.add(encoded);}}while(marker);return values.sort();}
   report.faultCases=[];
   for(const kind of ['claim','transfer','burn'])for(let at=1;at<=(kind==='claim'?9:11);at++){
    await step(kind+' native write fault '+at,async()=>{
     const label='fault'+kind+at,name=label+'.xah',args={label,tld:'xah'};
     await ac.registrar.buy(args);await close(8);
     if(kind!=='claim'){
      await ac.registrar.claimIncoming(name);
      await ac.resolver.setText({...args,key:'custom.native',value:'must clear'});
      await ac.resolver.setAddr({...args,coinType:21337,addr:Buffer.from(decodeAccountID(a.classicAddress))});
      await ac.resolver.setPrimary({...args,flag:true});
     }
     const id=(await ac.registrar.getRegistrationStatus(name)).uritokenId;
     if(kind==='transfer')await ac.registrar.createTransferOffer(name,b.classicAddress);
     const before=await namespace();
     const tx=await submit(kind==='transfer'?b:a,{TransactionType:kind==='burn'?'URITokenBurn':'URITokenBuy',URITokenID:id,...(kind!=='burn'?{Amount:'0'}:{}),HookParameters:[{HookParameter:{HookParameterName:'6669',HookParameterValue:at.toString(16).padStart(2,'0').toUpperCase()}}]});
     const failures=(tx.meta.HookExecutions??[]).map(x=>x.HookExecution).filter(x=>BigInt('0x'+x.HookReturnCode)===20n);
     assert(failures.length,'Selected write did not enter the state-error path');
     const after=await namespace();
     save(kind+'-'+at+'-state',{before,after});
     const state=await ac.registrar.getRegistrationStatus(name);assert.equal(state.stage,'recoveryRequired');
     let failedStrongRecovery;
     if(kind==='transfer'&&at===4){
      const beforeRepair=await namespace();
      const failed=await submit(a,{TransactionType:'Invoke',Destination:treasury.classicAddress,HookParameters:[...parameters('reconcile',{label:Buffer.from(label),tld:Buffer.from('xah'),token:Buffer.from(id,'hex')}),{HookParameter:{HookParameterName:'6669',HookParameterValue:'02'}}]},'tecHOOK_REJECTED');
      assert.deepEqual(await namespace(),beforeRepair,'A failed strong reconcile must roll back all of its changes');
      failedStrongRecovery={hash:failed.txHash,result:failed.engineResult,stateUnchanged:true};
     }
     await ac.registrar.reconcile(name);await ac.registrar.reconcile(name);
     if(kind!=='burn'){
      const owner=kind==='transfer'?bc:ac,expectedOwner=kind==='transfer'?b:a;
      const p=await owner.describe(name);assert.equal(p.owner,expectedOwner.classicAddress);assert.deepEqual(p.texts,{});assert.deepEqual(p.addrs,{});await owner.registrar.burn(name);
     }else assert.equal(await ac.describe(name),null);
     assert.equal(await ac.getPrimaryName(a.classicAddress),null);
     const evidence={kind,writeOrdinal:at,txHash:tx.txHash,nativeResult:tx.engineResult,failures,changedStateKeys:after.filter(([k,v])=>!before.some(([oldKey,oldValue])=>oldKey===k&&oldValue===v)).length+before.filter(([k])=>!after.some(([newKey])=>newKey===k)).length,recovered:true,...(failedStrongRecovery?{failedStrongRecovery}:{})};
     report.faultCases.push(evidence);save('fault-cases',report.faultCases);return evidence;
    });
   }
  }
  if(process.env.STANDALONE_EMITS==='1'){
   report.emitCases=[];
   for(const failRefund of [false,true])await step(failRefund?'native refund failure retains pending':'native mint failure refunds once',async()=>{
    const label=failRefund?'refundfailure':'mintfailure',name=label+'.xah',uri='https://example.com/metadata/'+name;
    const id=util.computeUritokenIdFromURI(treasury.classicAddress,uri);
    // A pre-existing native token forces the production emitted mint to fail.
    await submit(treasury,{TransactionType:'URITokenMint',URI:Buffer.from(uri).toString('hex').toUpperCase(),Flags:1});
    if(failRefund)await submit(a,{TransactionType:'AccountSet',SetFlag:1});
    const before=(await rpc.request({command:'account_info',account:a.classicAddress,ledger_index:'validated'})).result.account_data.Balance;
    const buy=await ac.registrar.buy({label,tld:'xah'});await close(8);
    const receipt=(await rpc.request({command:'tx',transaction:buy.txHash})).result;
    const history=(await rpc.request({command:'account_tx',account:treasury.classicAddress,ledger_index_min:receipt.ledger_index,ledger_index_max:-1,forward:true,limit:100})).result;
    assert(!history.marker,'Bounded emitted receipt query incomplete');
    const children=history.transactions.map(row=>({tx:row.tx??row.tx_json,meta:row.meta,hash:row.hash??row.tx?.hash??row.tx_json?.hash,validated:row.validated})).filter(row=>row.tx?.EmitDetails&&row.tx.Account===treasury.classicAddress);
    assert(children.every(row=>row.validated===true),'Child receipts must be validated');
    const mint=children.filter(row=>row.tx.TransactionType==='URITokenMint'&&row.tx.URI===Buffer.from(uri).toString('hex').toUpperCase());
    const refunds=children.filter(row=>row.tx.TransactionType==='Payment'&&row.tx.InvoiceID===id);
    assert.equal(mint.length,1);assert.notEqual(mint[0].meta.TransactionResult,'tesSUCCESS');assert.equal(refunds.length,1);
    assert.equal(refunds[0].meta.TransactionResult,failRefund?'tecDST_TAG_NEEDED':'tesSUCCESS');
    const after=(await rpc.request({command:'account_info',account:a.classicAddress,ledger_index:'validated'})).result.account_data.Balance;
    assert.equal(BigInt(before)-BigInt(after),BigInt(receipt.Fee)+(failRefund?1000000n:0n));
    const entries=(await rpc.request({command:'account_namespace',account:treasury.classicAddress,namespace_id:manifest.namespace,ledger_index:'validated'})).result;assert(!entries.marker);
    const state=new Map(entries.namespace_entries.map(row=>[row.HookStateKey,row.HookStateData]));
    assert.equal(state.has(util.pendingKey(id)),failRefund);assert.equal(state.has(util.asyncKey('rfd',id)),failRefund);
    const diagnostic=await ac.registrar.getRefundStatus(name);
    assert.equal(diagnostic.state,failRefund?'failed':'notTracked');
    if(failRefund){
     assert.equal(diagnostic.engineResult,'tecDST_TAG_NEEDED');assert.equal(diagnostic.transactionHash,refunds[0].hash);assert.equal(diagnostic.recovery,'operator');
     assert.equal((await ac.registrar.getRegistrationStatus(name)).stage,'refundPending');
     await submit(a,{TransactionType:'AccountSet',ClearFlag:1});await close(8);
     // The failed refund remains recorded; clearing a recipient flag must not replay payment.
     assert.equal((await ac.registrar.getRegistrationStatus(name)).stage,'refundPending');
     const latest=(await rpc.request({command:'account_info',account:a.classicAddress,ledger_index:'validated'})).result.account_data.Balance;
     assert(BigInt(latest)<BigInt(after),'No automatic refund after removing the recipient flag');
    }else{
     await submit(treasury,{TransactionType:'URITokenBurn',URITokenID:id});
     assert.equal((await ac.registrar.getRegistrationStatus(name)).stage,'available');
    }
    const evidence={name,buyHash:buy.txHash,mintResult:mint[0].meta.TransactionResult,refundResult:refunds[0].meta.TransactionResult,refundCount:refunds.length,pendingRetained:failRefund,diagnostic,children};
    report.emitCases.push(evidence);save('emit-cases',report.emitCases);return evidence;
   });
  }
  if(process.env.STANDALONE_REFUND_SETTLEMENT==='1')await step('paid refund survives callback cleanup failure',async()=>{
   const dir=path.join(base,'native-refund-cleanup-fault/issuance'),proof=JSON.parse(fs.readFileSync(path.join(dir,'proof.json'))),code=fs.readFileSync(path.join(dir,'xahau-name-hook.cleaned.wasm'));
   assert.equal(proof.testOnly,true);assert.equal(proof.guardPassed,true);assert.equal(proof.faultMode,'before refund cleanup');assert.equal(hash(code),proof.sha256);assert.equal(hash(fs.readFileSync(path.join(repo,'hook/src/common.h'))),proof.productionCommonSha256);assert.equal(hash(fs.readFileSync(path.join(repo,'hook/src/handlers/issuance.c'))),proof.productionHandlerSha256);
   await submit(treasury,{TransactionType:'SetHook',Hooks:parts.map(part=>({Hook:part==='issuance'?{...artifacts[0].Hook,CreateCode:code.toString('hex').toUpperCase()}:{}}))});
   const slots=(await rpc.request({command:'account_objects',account:treasury.classicAddress,type:'hook',ledger_index:'validated'})).result.account_objects.flatMap(x=>x.Hooks??[]);
   config.hookHashes.issuance=slots[0].Hook.HookHash;
   const label='paidtracking',name=label+'.xah',uri='https://example.com/metadata/'+name;
   await submit(treasury,{TransactionType:'URITokenMint',URI:Buffer.from(uri).toString('hex').toUpperCase(),Flags:1});
   const before=(await rpc.request({command:'account_info',account:a.classicAddress,ledger_index:'validated'})).result.account_data.Balance;
   const buy=await ac.registrar.buy({label,tld:'xah'});await close(8);
   const status=await ac.registrar.getRegistrationStatus(name);assert.equal(status.stage,'refundPending');assert(status.refundTxHash);
   const diagnostic=await ac.registrar.getRefundStatus(name);assert.equal(diagnostic.state,'paid');assert.equal(diagnostic.engineResult,'tesSUCCESS');assert.equal(diagnostic.recovery,'operator');
   const refund=(await rpc.request({command:'tx',transaction:status.refundTxHash})).result;assert.equal(refund.validated,true);assert.equal(refund.meta.TransactionResult,'tesSUCCESS');
   assert(refund.meta.HookExecutions.some(x=>BigInt('0x'+x.HookExecution.HookReturnCode)===20n),'Native callback cleanup fault not reached');
   const parent=(await rpc.request({command:'tx',transaction:buy.txHash})).result;
   const after=(await rpc.request({command:'account_info',account:a.classicAddress,ledger_index:'validated'})).result.account_data.Balance;
   assert.equal(BigInt(before)-BigInt(after),BigInt(parent.Fee),'Refund must repay exactly once');
   await close(8);
   assert.equal((await ac.registrar.getRefundStatus(name)).state,'paid');
   assert.equal((await rpc.request({command:'account_info',account:a.classicAddress,ledger_index:'validated'})).result.account_data.Balance,after,'No second payment while tracking remains');
   report.refundSettlementCase={buyHash:buy.txHash,refundHash:status.refundTxHash,diagnostic,paidOnce:true,pendingRetained:true,callbackExecutions:refund.meta.HookExecutions,testArtifact:proof};
   save('refund-settlement',report.refundSettlementCase);return report.refundSettlementCase;
  });
  Object.assign(report,{result:'PASS',scope:'Exact production artifacts on isolated native standalone; normal callbacks and lifecycle only, not fault injection'});
  if(report.faultCases)report.scope='Production lifecycle plus test-only claim/burn wrappers requesting native state_set invalid-key errors; not arbitrary node/consensus crash injection';
  if(report.emitCases)report.emitScope='Production issuance artifact: duplicate mint failure, successful refund, recipient-tag refund failure retaining correlation/pending; expiry and replay not tested';
  if(report.refundSettlementCase)report.refundSettlementScope='Test-only issuance copy requests a native invalid-key error immediately before refund cleanup; payment validates while pending/correlation remain';
 }catch(error){Object.assign(report,{result:'FAIL',stage,error:error.message});throw error;}
 finally{save('summary',report);for(const c of clients)await c.disconnect();if(rpc.isConnected())await rpc.disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
