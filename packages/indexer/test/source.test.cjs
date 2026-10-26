const test=require('node:test'),assert=require('node:assert/strict');
const {XahauLedgerSource}=require('../dist');const f=require('./fixtures.cjs');
function client(pages){let calls=0;return {networkID:21338,isConnected:()=>true,connect:async()=>{},disconnect:async()=>{},request:async req=>{if(req.command==='ledger')return{result:{validated:true,ledger_hash:f.hash(100),ledger:{ledger_index:'100',parent_hash:f.hash(99)}}};if(req.command==='account_objects')return{result:{account_objects:[{Hooks:Object.values(f.config.hookHashes).map(HookHash=>({Hook:{HookHash}}))}]}};if(req.command==='ledger_data'){assert.equal(req.ledger_hash,f.hash(100));return{result:pages[calls++]};}throw new Error('Unexpected request');}};}
test('pinned snapshot walks all pages and filters exact namespace/issuer',async()=>{const own={index:f.stateIndex(f.key('root')),LedgerEntryType:'HookState',HookStateKey:f.key('root'),HookStateData:f.root()},foreign={...own,index:f.stateIndex(f.key('root'),'AA'.repeat(32))};const pages=[{ledger_hash:f.hash(100),state:[own,foreign],marker:'next'},{ledger_hash:f.hash(100),state:[f.seed().tokens[f.id]]}];const s=new XahauLedgerSource(f.config,client(pages));await s.connect();const snapshot=await s.snapshot({ledgerIndex:100,ledgerHash:f.hash(100)});assert.equal(Object.keys(snapshot.state).length,1);assert.equal(snapshot.state[f.key('root')],f.root());assert.equal(snapshot.tokens[f.id].Owner,f.owner);});
test('snapshot rejects repeated marker, mixed ledger hash and wrong installed hooks',async()=>{const repeated=client([{ledger_hash:f.hash(100),state:[],marker:'repeat'},{ledger_hash:f.hash(100),state:[],marker:'repeat'}]);await assert.rejects(new XahauLedgerSource(f.config,repeated).snapshot({ledgerIndex:100,ledgerHash:f.hash(100)}),/Repeated/);const mixed=client([{ledger_hash:f.hash(101),state:[]}]);await assert.rejects(new XahauLedgerSource(f.config,mixed).snapshot({ledgerIndex:100,ledgerHash:f.hash(100)}),/Incomplete/);const wrong=client([]),request=wrong.request;wrong.request=async r=>r.command==='account_objects'?{result:{account_objects:[]}}:request(r);await assert.rejects(new XahauLedgerSource(f.config,wrong).snapshot({ledgerIndex:100,ledgerHash:f.hash(100)}),/hook hashes/);});
test('transport detects wrong network before reading or indexing',async()=>{const c=client([]);c.networkID=21337;await assert.rejects(new XahauLedgerSource(f.config,c).connect(),/network/);});

test('bootstrap retries a timed-out page without rescanning completed pages',async()=>{
 const {TimeoutError}=require('xahau'),requests=[];
 const own={index:f.stateIndex(f.key('root')),LedgerEntryType:'HookState',HookStateKey:f.key('root'),HookStateData:f.root()};
 const c=client([]),request=c.request;let failed=false;
 c.request=async r=>{
  if(r.command!=='ledger_data')return request(r);
  requests.push(structuredClone(r));
  if(!r.marker)return{result:{ledger_hash:f.hash(100),state:[own],marker:'next'}};
  if(!failed){failed=true;throw new TimeoutError('Request timed out');}
  return{result:{ledger_hash:f.hash(100),state:[f.seed().tokens[f.id]]}};
 };
 const snapshot=await new XahauLedgerSource(f.config,c,{snapshotRetryDelayMs:0}).snapshot({ledgerIndex:100,ledgerHash:f.hash(100)});
 assert.equal(snapshot.state[f.key('root')],f.root());assert.equal(snapshot.tokens[f.id].Owner,f.owner);
 assert.deepEqual(requests.map(r=>r.marker),[undefined,'next','next']);assert.deepEqual(requests[1],requests[2]);
});

test('bootstrap transport retries are bounded and never commit a partial snapshot',async()=>{
 const {TimeoutError}=require('xahau'),{createIndexer,SqliteStorage}=require('../dist');
 const c=client([]),request=c.request;let reads=0;
 c.request=async r=>{if(r.command!=='ledger_data')return request(r);reads++;
  if(!r.marker)return{result:{ledger_hash:f.hash(100),state:[],marker:'next'}};
  throw new TimeoutError('Request timed out');};
 const storage=new SqliteStorage(':memory:'),source=new XahauLedgerSource(f.config,c,{snapshotRetryDelayMs:0});
 const indexer=createIndexer({network:f.config,storage,source});
 try {
  await assert.rejects(indexer.bootstrap({ledgerIndex:100,ledgerHash:f.hash(100)}),TimeoutError);
  assert.equal(reads,4);assert.equal(storage.checkpoint(),null);assert.equal(Object.keys(storage.load().state).length,0);
 } finally {storage.close();}
});

test('bootstrap fails closed on RPC errors or a changed network after disconnection',async()=>{
 const {DisconnectedError}=require('xahau');
 for(const disconnect of [false,true]){
  const c=client([]),request=c.request;let reads=0,disconnects=0;
  c.disconnect=async()=>{disconnects++;};
  c.request=async r=>{if(r.command!=='ledger_data')return request(r);reads++;
   if(disconnect){c.networkID=21337;throw new DisconnectedError('Disconnected');}
   throw Object.assign(new Error('Pinned ledger unavailable'),{data:{error:'lgrNotFound'}});};
  const source=new XahauLedgerSource(f.config,c,{snapshotRetryDelayMs:0});
  await assert.rejects(source.snapshot({ledgerIndex:100,ledgerHash:f.hash(100)}),disconnect?/network/:/Pinned ledger unavailable/);
  assert.equal(reads,1);assert.equal(disconnects,disconnect?1:0);
 }
});

test('bootstrap can reconnect on the same network or disable transport retries',async()=>{
 const {NotConnectedError}=require('xahau');
 for(const retries of [0,2]){
  const c=client([]),request=c.request;let reads=0,connected=true,connects=0;
  c.isConnected=()=>connected;c.connect=async()=>{connected=true;connects++;};
  c.request=async r=>{if(r.command!=='ledger_data')return request(r);reads++;
   if(reads===1){connected=false;throw new NotConnectedError('Not connected');}
   return{result:{ledger_hash:f.hash(100),state:[]}};};
  const result=new XahauLedgerSource(f.config,c,{snapshotReadRetries:retries,snapshotRetryDelayMs:0}).snapshot({ledgerIndex:100,ledgerHash:f.hash(100)});
  if(retries)await result;else await assert.rejects(result,NotConnectedError);
  assert.equal(reads,retries?2:1);assert.equal(connects,retries?1:0);
 }
});
