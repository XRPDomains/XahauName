// Read-only replay of actual isolated-node fault receipts; no signer or public RPC.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('xahau'),{SqliteStorage,XahauLedgerSource,createIndexer}=require('../dist');
async function main(){
 assert.equal(process.env.XAHAUNAME_STANDALONE,'1');
 const run=process.env.STANDALONE_RECOVERY_RUN;assert(run&&/^[a-z0-9-]+$/.test(run));
 const base=path.resolve(__dirname,'../../../hook/build/current',run),summary=JSON.parse(fs.readFileSync(path.join(base,'summary.json')));
 assert.equal(summary.result,'PASS');assert.equal(summary.networkID,65535);assert.equal(summary.endpoint,'ws://127.0.0.1:26006');
 const output=path.join(base,'indexer-recovery.json');assert(!fs.existsSync(output),'Preserve previous replay evidence');
 const rpc=new Client(summary.endpoint),manifest=require('../../../deployments/testnet.json'),parts=require('../../../hook/config/handlers.json'),checks=[];
 try{
  await rpc.connect();assert.equal(rpc.networkID,65535);
  const selectedFaults=[...(summary.faultCases??[]).filter(x=>['transfer','burn'].includes(x.kind)&&x.writeOrdinal===4),
   ...(summary.maxInventoryCases??[]).filter(x=>x.failure).map(x=>({...x.failure,txHash:x.failure.hash,kind:x.kind.startsWith('transfer')?'transfer':'burn',domain:x.domain,maximum:true}))];
  assert(selectedFaults.length||summary.offerFailureCase,'A native lifecycle scenario is required');
  async function setup(index){
   const prior=(await rpc.request({command:'ledger',ledger_index:index,transactions:false})).result;
   const slots=(await rpc.request({command:'account_objects',account:summary.accounts.treasury,type:'hook',ledger_hash:prior.ledger_hash})).result.account_objects.flatMap(x=>x.Hooks??[]);
   assert.equal(slots.length,parts.length);
   const config={wss:summary.endpoint,treasury:summary.accounts.treasury,namespaceId:manifest.namespace,expectedNetworkId:65535,hookHashes:Object.fromEntries(parts.map((name,i)=>[name,slots[i].Hook.HookHash]))};
   const source=new XahauLedgerSource(config,rpc),storage=new SqliteStorage(':memory:'),indexer=createIndexer({network:config,storage,source});
   try{await indexer.bootstrap({ledgerIndex:index,ledgerHash:prior.ledger_hash});}catch(error){storage.close();throw error;}
   return{source,storage,indexer};
  }
  for(const fault of selectedFaults){
   const kind=fault.kind;
   const receipt=(await rpc.request({command:'tx',transaction:fault.txHash})).result;assert.equal(receipt.validated,true);
   const {source,storage,indexer}=await setup(receipt.ledger_index-1);
   const domain=fault.domain??'fault'+kind+'4.xah';
   try{
    assert.equal(indexer.describe(domain).status,'claimed');
    if(fault.maximum){assert.equal(Object.keys(indexer.describe(domain).addrs).length,15);assert.equal(Object.keys(indexer.describe(domain).texts).length,15);}
    const events=await indexer.applyLedger(await source.ledger(receipt.ledger_index));
    assert.equal(indexer.describe(domain).status,'recoveryRequired');assert(events.some(x=>x.type==='HookExecutionFailed'));
    assert(!indexer.listOwnedDomains(summary.accounts.a).includes(domain));assert(!indexer.listOwnedDomains(summary.accounts.b).includes(domain));
    let next=receipt.ledger_index+1;
    if(fault.failedStrongRecovery){
     const failed=await source.ledger(next++);assert(failed.receipts.some(x=>x.hash===fault.failedStrongRecovery.hash&&x.meta.TransactionResult==='tecHOOK_REJECTED'));
     await indexer.applyLedger(failed);assert.equal(indexer.describe(domain).status,'recoveryRequired');
    }
    await indexer.applyLedger(await source.ledger(next++));
    if(kind==='transfer'){const p=indexer.describe(domain);assert.equal(p.status,'claimed');assert.equal(p.owner,summary.accounts.b);assert.deepEqual(p.texts,{});assert.deepEqual(p.addrs,{});}
    else assert.equal(indexer.describe(domain),null);
    assert.equal(indexer.listRecovery().some(x=>x.domain===domain),false);
    await indexer.applyLedger(await source.ledger(next)); // Second reconcile remains idempotent.
    checks.push({kind:fault.maximum?'maximum-'+kind:kind,domain,failureHash:fault.txHash,fromLedger:receipt.ledger_index-1,throughLedger:next,quarantined:true,recovered:true,failedStrongRecoveryVerified:!!fault.failedStrongRecovery,eventTypes:events.map(x=>x.type)});
   }finally{storage.close();}
  }
  if(summary.offerFailureCase){
   const item=summary.offerFailureCase,domain=item.domain;
   async function receipt(hash){const r=(await rpc.request({command:'tx',transaction:hash})).result;assert.equal(r.validated,true);return r;}
   const [buy,refund,burn]=await Promise.all([receipt(item.buyHash),receipt(item.refundHash),receipt(item.cleanupBurnHash)]);
   const lastBurn=summary.transactions.find(x=>x.stage==='same name reissues after reserved token cleanup'&&x.transaction.TransactionType==='URITokenBurn');assert(lastBurn);
   const claim=summary.transactions.find(x=>x.stage==='same name reissues after reserved token cleanup'&&x.transaction.TransactionType==='URITokenBuy');assert(claim);
   const [end,reclaim]=await Promise.all([receipt(lastBurn.hash),receipt(claim.hash)]);assert(end.ledger_index-buy.ledger_index<128,'Bounded isolated replay only');
   const {source,storage,indexer}=await setup(buy.ledger_index-1),events=[];
   try{
    assert.equal(indexer.describe(domain),null);
    for(let index=buy.ledger_index;index<=end.ledger_index;index++){
     const batch=await indexer.applyLedger(await source.ledger(index));events.push(...batch);
     if(index<=burn.ledger_index)assert(!batch.some(x=>x.type==='DomainClaimed'||x.type==='DomainTransferred'),'A refunded unclaimed token cannot emit an ownership event');
     if(index===refund.ledger_index){
      assert.equal(indexer.describe(domain).status,'recoveryRequired');
      assert(!indexer.listOwnedDomains(summary.accounts.a).includes(domain));assert(!indexer.listOwnedDomains(summary.accounts.treasury).includes(domain));
      assert(!indexer.listIncomingOffers(summary.accounts.a).some(x=>x.domain===domain),'Rejected offer must not enter recipient inbox');
     }
     if(index===burn.ledger_index)assert.equal(indexer.describe(domain),null);
     if(index===reclaim.ledger_index){const p=indexer.describe(domain);assert.equal(p.status,'claimed');assert.equal(p.owner,summary.accounts.a);assert.deepEqual(p.texts,{});assert.deepEqual(p.addrs,{});}
    }
    assert.equal(indexer.describe(domain),null);
    checks.push({kind:'offer-failure',domain,fromLedger:buy.ledger_index-1,throughLedger:end.ledger_index,refundLedger:refund.ledger_index,reservationBurnLedger:burn.ledger_index,reclaimLedger:reclaim.ledger_index,rejectedOfferNotOwned:true,rejectedOfferNotInInbox:true,refundedReservationQuarantined:true,reissuedAndCleaned:true,eventTypes:events.map(x=>x.type)});
   }finally{storage.close();}
  }
  fs.writeFileSync(output,JSON.stringify({networkID:65535,readOnly:true,result:'PASS',checks},null,2)+'\n');console.log(JSON.stringify({result:'PASS',checks}));
 }finally{await rpc.disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
