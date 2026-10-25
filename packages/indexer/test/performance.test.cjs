const test=require('node:test'),assert=require('node:assert/strict');
const {createIndexer,SqliteStorage}=require('../dist');
const projection=require('../dist/projection'),f=require('./fixtures.cjs');
test('one changed profile projects one domain and never clones/scans the full materialized state',async()=>{
 const store=new SqliteStorage(':memory:'),i=createIndexer({network:f.config,storage:store,source:f.source()});await i.bootstrap();
 const original=projection.projectDomain;let calls=0;projection.projectDomain=async(...args)=>{calls++;return original(...args);};
 // Any full state enumeration/clone would evaluate this unrelated getter.
 Object.defineProperty(i.state.state,'unrelated',{enumerable:true,get(){throw Error('Unexpected full projection scan');}});
 for(let n=0;n<100;n++)i.state.domains['other'+n+'.xah']={domain:'other'+n+'.xah',status:'claimed',owner:f.owner};
 try{await i.applyLedger(f.ledger(101,[f.receipt(101,[f.stateNode(f.key('text:description'),f.hex('changed'))])]));assert.equal(calls,1);assert.equal(i.describe(f.domain).texts.description,'changed');}
 finally{projection.projectDomain=original;store.close();}
});
test('unrelated full-ledger transactions validate but are not retained unless archival mode is enabled',async()=>{
 for(const archive of [false,true]){
  const store=new SqliteStorage(':memory:'),i=createIndexer({network:f.config,storage:store,source:f.source(),retainAllReceipts:archive});await i.bootstrap();let count;const commit=store.commit.bind(store);store.commit=batch=>{count=batch.receipts.length;commit(batch);};
  const receipts=Array.from({length:100},(_,n)=>{const r=f.receipt(101,[],{TransactionType:'Payment',Account:f.recipient,Destination:f.recipient,Amount:String(n+1)});r.meta.TransactionIndex=n;return r;});
  await i.applyLedger(f.ledger(101,receipts));assert.equal(count,archive?100:0);assert.equal(store.checkpoint().ledgerIndex,101);store.close();
 }
});
test('dependency and collection indexes roll back after failed persistence and observe a retry',async()=>{
 const store=new SqliteStorage(':memory:'),i=createIndexer({network:f.config,storage:store,source:f.source()});await i.bootstrap();const commit=store.commit.bind(store);let once=true;
 store.commit=batch=>{if(once){once=false;throw Error('disk full');}commit(batch);};
 const receipt=f.receipt(101,[f.stateNode(f.key('text:description'),f.hex('retry'))]);await assert.rejects(i.applyLedger(f.ledger(101,[receipt])),/disk full/);assert.equal(i.describe(f.domain).texts.description,'Original profile');
 await i.applyLedger(f.ledger(101,[receipt]));assert.equal(i.describe(f.domain).texts.description,'retry');assert.deepEqual(i.listOwnedDomainsPage(f.owner).items,[f.domain]);store.close();
});
test('idle sync verifies a header without downloading expanded anchor transactions',async()=>{
 const source=f.source();let headers=0;source.header=async index=>{headers++;return{checkpoint:{ledgerIndex:index,ledgerHash:f.hash(index)},parentHash:f.hash(index-1)};};source.ledger=async()=>{throw Error('Expanded anchor requested');};
 const store=new SqliteStorage(':memory:'),i=createIndexer({network:f.config,storage:store,source});await i.bootstrap();await i.syncOnce();assert.equal(headers,1);store.close();
});
test('ledger subscription wakes replay, cleans listeners and subscribes again after disconnect',async()=>{
 const {EventEmitter}=require('node:events'),{XahauLedgerSource}=require('../dist');
 const client=new EventEmitter();let requests=0;client.request=async()=>{requests++;return{result:{}};};
 const source=new XahauLedgerSource(f.config,client),abort=new AbortController();
 const next=source.waitForLedger(abort.signal,1000);await new Promise(setImmediate);client.emit('ledgerClosed',{});await next;assert.equal(client.listenerCount('ledgerClosed'),0);assert.equal(requests,1);
 await source.waitForLedger(abort.signal,5);assert.equal(requests,1);client.emit('disconnected');
 const retry=source.waitForLedger(abort.signal,1000);await new Promise(setImmediate);abort.abort();await retry;assert.equal(requests,2);assert.equal(client.listenerCount('ledgerClosed'),0);
});
