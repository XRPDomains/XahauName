const test=require('node:test'),assert=require('node:assert/strict');
const {XahauNameClient,TESTNET,util,waitValidated,encodeAddress}=require('../dist');
const {beforeDeadline}=require('../dist/deadline');
const {ReadScheduler}=require('../dist/read-scheduler');
const {snapshotContext}=require('../dist/read-snapshot');
const H='AB'.repeat(32),key=i=>i.toString(16).padStart(64,'0').toUpperCase();
test('native low-fee rejection explains the fee refresh without claiming insufficient balance',()=>{
 const {explainError}=require('../dist');
 const direct=explainError({code:'telINSUF_FEE_P'});
 assert.equal(direct.title,'Network fee is too low');assert.equal(direct.stage,'ledger');assert.equal(direct.recovery,'correct-input');
 const wrapped=explainError({details:{engineResult:'telINSUF_FEE_P',txHash:'AB'.repeat(32)}});
 assert.equal(wrapped.title,direct.title);assert.equal(wrapped.txHash,'AB'.repeat(32));assert.match(wrapped.message,/check its transaction status/);
});
function client(options={}){const c=new XahauNameClient({...TESTNET,...options});c.rawClient.isConnected=()=>true;c.rawClient.networkID=21338;return c;}
test('disabled cache stores nothing; entry and byte caps evict even without a repeat lookup',async()=>{
 for(const config of [{cacheTtlMs:0},{cacheMaxEntries:0},{cacheMaxBytes:0}]){const c=client(config);c.rawClient.request=async()=>({result:{node:{HookStateData:'00'}}});for(let i=0;i<30;i++)await c.readState(key(i));assert.equal(c.cache.size,0);}
 const c=client({cacheMaxEntries:3,cacheMaxBytes:700});c.rawClient.request=async()=>({result:{node:{HookStateData:'ab'.repeat(100)}}});
 for(let i=0;i<50;i++)await c.readState(key(i));assert(c.cache.size<=3);assert(c.cacheBytes<=700);assert(!c.cache.has('validated:'+key(0)));
});
test('in-flight reads cannot resurrect cache after clear or signer changes',async()=>{
 for(const invalidate of [c=>c.clearCache(),c=>c.setSigner(null)]){
  const c=client();let finish;c.rawClient.request=()=>new Promise(resolve=>{finish=resolve;});const pending=c.readState(key(1));await new Promise(setImmediate);invalidate(c);finish({result:{node:{HookStateData:'AB'}}});assert.deepEqual(await pending,Buffer.from('ab','hex'));assert.equal(c.cache.size,0);
 }
});
test('cached null and buffers preserve absent-value and mutation isolation',async()=>{
 const c=client();let calls=0;c.rawClient.request=async()=>{calls++;return{result:{node:{HookStateData:'AB'}}};};const v=await c.readState(key(1));v[0]=0;assert.equal((await c.readState(key(1)))[0],171);assert.equal(calls,1);
 c.rawClient.request=async()=>{calls++;throw {data:{error:'entryNotFound'}};};assert.equal(await c.readState(key(2)),null);assert.equal(await c.readState(key(2)),null);assert.equal(calls,2);
});
test('confirmation deadline and abort interrupt a permanently pending RPC without losing the hash',async()=>{
 const rpc={request:()=>new Promise(()=>{})},hash='CD'.repeat(32);
 await assert.rejects(waitValidated(rpc,hash,{timeoutMs:20,intervalMs:5}),e=>e.code==='TIMEOUT'&&e.txHash===hash);
 const controller=new AbortController(),p=waitValidated(rpc,hash,{timeoutMs:1000,signal:controller.signal});controller.abort();await assert.rejects(p,e=>e.code==='ABORTED'&&e.txHash===hash);
 for(const timeoutMs of [0,-1,NaN,Infinity])await assert.rejects(waitValidated(rpc,hash,{timeoutMs}),e=>e.code==='INVALID_ARGUMENT');
});
test('registration deadline also covers stalled ledger reads',async()=>{
 const c=client();c.rawClient.request=()=>new Promise(()=>{});
 await assert.rejects(c.registrar.waitForOffer('alice.xah',{timeoutMs:20,pollIntervalMs:5}),e=>e.code==='TIMEOUT');
});
test('deadline handles late rejection, and abort before starting does not call the reader',async()=>{
 let reject,started=0;const p=beforeDeadline(()=>{started++;return new Promise((_r,j)=>reject=j);},Date.now()+10);await assert.rejects(p,e=>e.code==='TIMEOUT');reject(Error('late'));
 const controller=new AbortController();controller.abort();await assert.rejects(beforeDeadline(async()=>{started++;},Date.now()+50,controller.signal),e=>e.code==='ABORTED');assert.equal(started,1);
});
test('client scheduler bounds aggregate calls, releases failed slots and bounds queued work',async()=>{
 const scheduler=new ReadScheduler(2);let active=0,peak=0;
 await Promise.allSettled(Array.from({length:20},(_,i)=>scheduler.run(async()=>{active++;peak=Math.max(peak,active);await new Promise(setImmediate);active--;if(i===4)throw Error('read failed');return i;})));assert.equal(peak,2);
 const blocked=new ReadScheduler(1),pending=[];pending.push(blocked.run(()=>new Promise(()=>{})));for(let i=0;i<1024;i++)pending.push(blocked.run(async()=>{}));await assert.rejects(blocked.run(async()=>{}),e=>e.code==='RPC_LIMIT');
});
function profile(){
 const c=client({cacheTtlMs:0}),states=new Map(),calls=[],name='alice.xah',id=util.computeUritokenId(TESTNET.treasury,'alice','xah');
 const root=Buffer.alloc(32);Buffer.from(require('xahau').decodeAccountID(TESTNET.treasury)).copy(root);root[20]=1;
 states.set(util.rootKey('alice','xah'),root);states.set(util.tokenKey('alice','xah'),Buffer.from(id,'hex'));states.set(util.labelOfKey(id),Buffer.from(name));states.set(util.primaryOfKey(TESTNET.treasury),Buffer.from(util.rootKey('alice','xah'),'hex'));
 states.set(util.addrKey('alice','xah',21337),encodeAddress(21337,TESTNET.treasury));states.set(util.textKey('alice','xah','description'),Buffer.from('Hello'));
 const token={LedgerEntryType:'URIToken',index:id,Issuer:TESTNET.treasury,Owner:TESTNET.treasury,URI:Buffer.from(name).toString('hex')};
 c.rawClient.request=async q=>{calls.push(q);if(q.command==='ledger')return{result:{ledger_hash:H}};if(q.command==='account_objects')return{result:{account_objects:[token]}};if(q.index===id)return{result:{node:token}};const value=states.get(q.hook_state?.key);if(value)return{result:{node:{HookStateData:value.toString('hex')}}};throw {data:{error:'entryNotFound'}};};return{c,states,calls,token};
}
test('explicit selections avoid descriptor RPCs, deduplicate and identify partial profiles',async()=>{
 const {c,calls}=profile(),p=await c.describe('alice.xah',{addrs:[],texts:['description','description']});assert.equal(p.texts.description,'Hello');assert.equal(p.textKeysComplete,false);assert(!calls.some(q=>q.hook_state?.key===util.recordsKey('alice','xah')));
 await assert.rejects(c.describe('alice.xah',{addrs:[],texts:Array(65).fill('description')}),e=>e.code==='INVALID_ARGUMENT');
});
test('readonly session reuses completed identity reads; receiving address never falls back to owner',async()=>{
 const {c,calls}=profile(),session=await c.read.snapshot();assert.equal(await session.getOwner({name:'alice.xah'}),TESTNET.treasury);const n=calls.length;assert.equal(await session.getOwner({name:'alice.xah'}),TESTNET.treasury);assert.equal(calls.length,n);
 assert.equal(await session.getAddress({name:'alice.xah',coinType:60}),null);assert.equal(await session.getName({address:TESTNET.treasury,name:'ALICE.XAH'}),'alice.xah');
 const records=await session.getRecords({name:'alice.xah',addresses:[21337],texts:['description']});assert.equal(records.complete,false);assert.equal(records.source,'ledger');assert.equal(records.addresses[21337].value,TESTNET.treasury);
 await assert.rejects(session.getText({name:'alice.xah',key:'description',ledgerHash:'CD'.repeat(32)}),/mismatch/);
});
test('owned pages pin continuation ledger and reject cursors for a different address',async()=>{
 const {c,token}=profile();let count=0;c.rawClient.request=async q=>{if(q.command==='ledger')return{result:{ledger_hash:H}};if(q.command==='account_objects'){assert.equal(q.ledger_hash,H);return{result:{account_objects:[],...(count++===0?{marker:'page2'}:{})}};}throw Error('unexpected read');};
 const page=await c.read.getNames({address:token.Owner,limit:5,ledgerHash:H.toLowerCase()});assert.equal(page.complete,false);const next=await c.read.getNames({address:token.Owner,cursor:page.nextCursor});assert.equal(next.complete,true);assert.equal(next.ledgerHash,H);
 await assert.rejects(c.read.getNames({address:require('xahau').Wallet.generate().classicAddress,cursor:page.nextCursor}),e=>e.code==='INVALID_ARGUMENT');
});
test('incoming offer refresh uses only new history, reuses immutable snapshots and bounds concurrency',async()=>{
 const {c,calls,token}=profile(),recipient=require('xahau').Wallet.generate().classicAddress,raw=c.rawClient.request;let index=100;
 token.Amount='0';token.Destination=recipient;
 c.rawClient.request=async q=>{
  if(q.command==='ledger')return{result:{ledger_hash:H,ledger_index:index}};
  if(q.command==='account_tx'){calls.push(q);return{result:{ledger_index_min:q.ledger_index_min===-1?1:q.ledger_index_min,ledger_index_max:index,transactions:index===100?[{validated:true,tx:{Destination:recipient,URITokenID:token.index},meta:{TransactionResult:'tesSUCCESS'}}]:[]}};}
  return raw(q);
 };
 const first=await c.listIncomingDomains(recipient,{ledgerHash:H});assert.equal(first.offers.length,1);const before=calls.length;
 first.offers[0].domain='mutated';assert.equal((await c.listIncomingDomains(recipient,{ledgerHash:H})).offers[0].domain,'alice.xah');assert.equal(calls.length,before);
 index=101;await c.listIncomingDomains(recipient,{ledgerHash:'CD'.repeat(32)});const history=calls.filter(q=>q.command==='account_tx');assert.equal(history.length,2);assert.equal(history[1].ledger_index_min,101);
});
test('failed session reads are evicted so a transient failure can be retried',async()=>{
 let n=0;const ctx=snapshotContext({readState:async()=>{if(!n++)throw Error('temporary');return Buffer.from([1]);}},H);
 await assert.rejects(ctx.readState(key(1)));assert.deepEqual(await ctx.readState(key(1)),Buffer.from([1]));
});
