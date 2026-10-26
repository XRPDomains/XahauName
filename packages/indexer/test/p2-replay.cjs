// Explicit bounded historical replay into the disposable P2 SQLite database. No ledger writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('xahau');
const {resolveNetworkConfig}=require('@xahauname/sdk');
const {createIndexer,SqliteStorage,XahauLedgerSource}=require('../dist');
async function main(){
 assert.equal(process.env.P2_INDEXER_READONLY,'1');
 const directory=process.env.P2_INDEXER_OUTPUT,targetFile=process.env.P2_REPLAY_TARGET;
 assert(directory&&targetFile,'Explicit P2 database and pinned replay target required');
 const output=path.join(directory,'replay-summary.json');assert(!fs.existsSync(output),'Do not overwrite replay evidence');
 const target=JSON.parse(fs.readFileSync(targetFile,'utf8')),targetIndex=Number(target.ledgerIndex);
 const config=resolveNetworkConfig({network:'testnet'}),rpc=new Client(config.wss,{connectionTimeout:6000,timeout:20000});
 const source=new XahauLedgerSource(config,rpc),store=new SqliteStorage(path.join(directory,'projection.sqlite'));
 const indexer=createIndexer({network:config,storage:store,source}),before=store.checkpoint();assert(before);
 assert(targetIndex>before.ledgerIndex&&targetIndex-before.ledgerIndex<=256,'Replay must be forward and bounded to 256 ledgers');
 const report={networkId:21338,readOnly:true,result:'IN_PROGRESS',from:before,to:{ledgerIndex:targetIndex,ledgerHash:target.ledgerHash},ledgers:0,transactions:0,events:0,eventKinds:{}};
 try{
  await source.connect();assert.deepEqual((await source.header(before.ledgerIndex)).checkpoint,before);
  for(let i=before.ledgerIndex+1;i<=targetIndex;i++){
   const ledger=await source.ledger(i),events=await indexer.applyLedger(ledger);
   report.ledgers++;report.transactions+=ledger.receipts.length;report.events+=events.length;
   for(const event of events)report.eventKinds[event.type]=(report.eventKinds[event.type]??0)+1;
   if(report.ledgers%10===0)console.log(JSON.stringify({phase:'replay',ledger:i,target:targetIndex}));
  }
  assert.deepEqual(store.checkpoint(),{ledgerIndex:targetIndex,ledgerHash:target.ledgerHash});
  const after=store.load();assert.deepEqual(Object.entries(after.state).sort(),target.entries.map(e=>[e.key,e.value]).sort());
  const live=require('../../../deployments/testnet-p2-validation.json');for(const name of live.domains)assert.equal(indexer.describe(name),null,'Burned test domain remains indexed');
  let closes=0;const closed=()=>{closes++;};rpc.on('ledgerClosed',closed);
  await source.waitForLedger(new AbortController().signal,10000);assert(closes>0,'No real ledger-close notification observed');
  await source.disconnect();await source.connect();closes=0;
  await source.waitForLedger(new AbortController().signal,10000);assert(closes>0,'Ledger subscription did not recover after reconnect');rpc.removeListener('ledgerClosed',closed);
  const committedEvents=indexer.events(0,1000),lastCursor=committedEvents.at(-1)?.cursor??0;
  report.result='PASS';report.namespaceEntries=Object.keys(after.state).length;report.projectedDomains=Object.keys(after.domains).length;
  report.realLedgerSubscription=true;report.resubscriptionAfterDisconnect=true;report.lastEventCursor=lastCursor;
 }catch(error){report.result='FAIL';report.error=error.message;throw error;}
 finally{fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(rpc.isConnected())await rpc.disconnect();store.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
