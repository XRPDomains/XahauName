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
  for(const kind of ['transfer','burn']){
   const fault=summary.faultCases.find(x=>x.kind===kind&&x.writeOrdinal===4);assert(fault);
   const receipt=(await rpc.request({command:'tx',transaction:fault.txHash})).result;assert.equal(receipt.validated,true);
   const prior=(await rpc.request({command:'ledger',ledger_index:receipt.ledger_index-1,transactions:false})).result;
   const slots=(await rpc.request({command:'account_objects',account:summary.accounts.treasury,type:'hook',ledger_hash:prior.ledger_hash})).result.account_objects.flatMap(x=>x.Hooks??[]);
   const config={wss:summary.endpoint,treasury:summary.accounts.treasury,namespaceId:manifest.namespace,expectedNetworkId:65535,hookHashes:Object.fromEntries(parts.map((name,i)=>[name,slots[i].Hook.HookHash]))};
   const source=new XahauLedgerSource(config,rpc),storage=new SqliteStorage(':memory:'),indexer=createIndexer({network:config,storage,source});
   const domain='fault'+kind+'4.xah';
   try{
    await indexer.bootstrap({ledgerIndex:receipt.ledger_index-1,ledgerHash:prior.ledger_hash});assert.equal(indexer.describe(domain).status,'claimed');
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
    checks.push({kind,domain,failureHash:fault.txHash,fromLedger:receipt.ledger_index-1,throughLedger:next,quarantined:true,recovered:true,failedStrongRecoveryVerified:!!fault.failedStrongRecovery,eventTypes:events.map(x=>x.type)});
   }finally{storage.close();}
  }
  fs.writeFileSync(output,JSON.stringify({networkID:65535,readOnly:true,result:'PASS',checks},null,2)+'\n');console.log(JSON.stringify({result:'PASS',checks}));
 }finally{await rpc.disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
