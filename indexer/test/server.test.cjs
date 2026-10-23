const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');const {once}=require('node:events');
const {createIndexer,SqliteStorage}=require('../dist');const {IndexerReadClient}=require('@xahauname/sdk');const f=require('./fixtures.cjs');
test('example HTTP and SSE serve a persisted projection through the SDK reader',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xahauname-api-')),file=path.join(dir,'test.sqlite');let child;
 try {
  const storage=new SqliteStorage(file),i=createIndexer({network:f.config,storage,source:f.source()});await i.bootstrap();
  await i.applyLedger(f.ledger(101,[f.receipt(101,[f.stateNode(f.key('text:description'),f.hex('API fixture'))])]));storage.close();
  child=spawn(process.execPath,[path.join(__dirname,'../examples/server.cjs')],{env:{...process.env,PORT:'0',XAHAU_NETWORK:'testnet',XAHAU_INDEX_DB:file,XAHAU_INDEX_SYNC:'0'},stdio:['ignore','pipe','pipe']});
  const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('API startup timeout')),10000);child.stdout.on('data',b=>{output+=b;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});child.stderr.on('data',b=>{clearTimeout(timer);reject(new Error(String(b)));});child.once('exit',code=>{clearTimeout(timer);reject(new Error('API exited: '+code));});});
  const client=new IndexerReadClient({url,networkId:21338});
  const p=await client.describe(f.domain);assert.equal(p.data.texts.description,'API fixture');assert.equal(p.status.indexedThroughLedger,101);assert.equal(p.status.lastSuccessfulSyncAt,null);
  assert.deepEqual((await client.listOwnedDomains(f.owner)).data,[f.domain]);assert.equal((await client.getVerifiedPrimaryName(f.owner)).data,f.domain);
  const events=(await client.events()).data;assert(events.length>=2);assert(events.some(e=>e.type==='DomainUpdated'));
  assert.equal((await fetch(url+'/missing')).status,404);assert.equal((await fetch(url+'/events?after=-1')).status,400);
  const abort=new AbortController(),stream=await fetch(url+'/stream',{signal:abort.signal,headers:{'Last-Event-ID':String(events[0].cursor)}});
  assert.match(stream.headers.get('content-type'),/text\/event-stream/);const reader=stream.body.getReader(),packet=await reader.read();const text=Buffer.from(packet.value).toString();assert(text.includes('id: '+events[1].cursor));assert(!text.includes('id: '+events[0].cursor+'\n'));await reader.cancel();abort.abort();
 } finally {
  if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}
  for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);
 }
});
