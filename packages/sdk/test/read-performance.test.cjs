const test=require('node:test'),assert=require('node:assert/strict');
const {Wallet,decodeAccountID}=require('xahau');
const {XahauNameClient,TESTNET,util}=require('../dist');
const {snapshotContext,mapReads}=require('../dist/read-snapshot');
const owner=Wallet.generate().classicAddress,H='AB'.repeat(32);
function fixture(count=1){
 const states=new Map(),tokens=[],calls=[];
 for(let i=0;i<count;i++){
  const label='portfolio'+i,domain=label+'.xah',id=util.computeUritokenId(TESTNET.treasury,label,'xah');
  const root=Buffer.alloc(32);Buffer.from(decodeAccountID(owner)).copy(root);root[20]=i===0?1:0;
  states.set(util.rootKey(label,'xah'),root);states.set(util.tokenKey(label,'xah'),Buffer.from(id,'hex'));states.set(util.labelOfKey(id),Buffer.from(domain));
  tokens.push({LedgerEntryType:'URIToken',index:id,Issuer:TESTNET.treasury,Owner:owner,URI:Buffer.from(domain).toString('hex')});
 }
 states.set(util.primaryOfKey(owner),Buffer.from(util.rootKey('portfolio0','xah'),'hex'));
 const pricing=Buffer.alloc(81);pricing[0]=1;for(let i=0;i<10;i++)pricing.writeBigUInt64BE(1000000n,1+i*8);
 states.set(util.pricingKey(),pricing);states.set(util.uriBaseKey(),Buffer.from('https://example.com/metadata/'));
 const client=new XahauNameClient({...TESTNET,cacheTtlMs:0});
 client.rawClient.request=async q=>{
  calls.push(q);
  if(q.command==='ledger')return{result:{ledger_hash:H}};
  assert.equal(q.ledger_hash,H);
  if(q.command==='account_objects')return{result:{account_objects:tokens}};
  if(q.command==='ledger_entry'&&q.hook_state){const value=states.get(q.hook_state.key);if(value)return{result:{node:{HookStateData:value.toString('hex')}}};}
  if(q.command==='ledger_entry'&&q.index){const token=tokens.find(t=>t.index===q.index);if(token)return{result:{node:token}};}
  throw Object.assign(Error('not found'),{data:{error:'entryNotFound'}});
 };
 return{client,states,tokens,calls};
}
function profileFixture(){
 const f=fixture(),label='portfolio0',idx=Buffer.alloc(124);idx[0]=1;idx.writeUInt16BE(1,1);idx[3]=2;idx.writeUInt16BE(144,4);idx[34]=1;idx[40]=2;
 f.states.set(util.recordsKey(label,'xah'),idx);
 f.states.set(util.addrKey(label,'xah',144),Buffer.from(decodeAccountID(owner)));
 f.states.set(util.textKey(label,'xah','description'),Buffer.from('Profile description'));
 f.states.set(util.textKey(label,'xah','url'),Buffer.from('https://example.com'));
 return f;
}

test('profile snapshot removes repeated identity/state reads from the previous UI composition',async()=>{
 const before=profileFixture(),c=before.client,name='portfolio0.xah',ledgerHash=await c.getLedgerHash(),opts={ledgerHash,bypassCache:true};
 const p=await c.describe(name,opts),id=await c.registrar.getTokenId(name,opts);
 await c.getLedgerObject(id,opts);await c.registrar.getTokenURI(name,opts);
 await c.getAvatar(name,{...opts,fallbackToMetadata:false});
 const f=profileFixture(),snapshot=await f.client.getProfileSnapshot(name);
 assert.deepEqual(snapshot.profile,p);assert.equal(snapshot.uri,name);assert.equal(snapshot.tokenId,f.tokens[0].index);assert.equal(snapshot.transferOffer,null);assert.equal(snapshot.ledgerHash,H);
 assert(f.calls.length<before.calls.length);
 assert.equal(new Set(f.calls.map(call=>JSON.stringify(call))).size,f.calls.length);
 assert.equal(f.calls.length,14);
 console.log(`Profile RPCs: previous composition (without metadata fallback) ${before.calls.length} → snapshot ${f.calls.length}`);
 const n=f.calls.length;await f.client.getProfileSnapshot(name);assert.equal(f.calls.length-n,14,'Each call must read fresh state');
});

test('profile snapshots preserve pending, native-owner and identity rejection and transfer-offer display',async()=>{
 for(const mode of ['pending','owner','uri']){
  const f=profileFixture();if(mode==='pending')f.states.set(util.pendingKey(f.tokens[0].index),Buffer.alloc(32));
  if(mode==='owner')f.tokens[0].Owner=Wallet.generate().classicAddress;
  if(mode==='uri')f.tokens[0].URI=Buffer.from('wrong.xah').toString('hex');
  await assert.rejects(f.client.getProfileSnapshot('portfolio0.xah'),error=>error.code==='OWNERSHIP_MISMATCH');
 }
 const f=profileFixture();f.tokens[0].Destination=Wallet.generate().classicAddress;f.tokens[0].Amount='0';
 assert.deepEqual((await f.client.getProfileSnapshot('portfolio0.xah')).transferOffer,{destination:f.tokens[0].Destination,amountDrops:'0'});
 assert.equal(await fixture(0).client.getProfileSnapshot('missing.xah'),null);
});

test('custom text descriptors load concurrently with bounded fan-out and preserve complete keys',async()=>{
 const f=profileFixture(),idx=Buffer.alloc(124);idx[0]=1;idx[3]=6;const slotKeys=new Set();
 for(let i=0;i<6;i++){
  const key='custom.key'+i,stateKey=util.textKey('portfolio0','xah',key),slotKey=util.textSlotKey('portfolio0','xah',i);
  idx[34+i*6]=255;idx[35+i*6]=i;slotKeys.add(slotKey);
  f.states.set(slotKey,Buffer.concat([Buffer.from(stateKey,'hex'),Buffer.from(key)]));f.states.set(stateKey,Buffer.from('value'+i));
 }
 f.states.set(util.recordsKey('portfolio0','xah'),idx);const request=f.client.rawClient.request.bind(f.client.rawClient);let active=0,peak=0;
 f.client.rawClient.request=async q=>{if(!slotKeys.has(q.hook_state?.key))return request(q);active++;peak=Math.max(peak,active);await new Promise(setImmediate);try{return await request(q);}finally{active--;}};
 const snapshot=await f.client.getProfileSnapshot('portfolio0.xah');assert.equal(peak,4);assert.equal(Object.keys(snapshot.profile.texts).length,6);assert.equal(snapshot.profile.textKeysComplete,true);
 assert.equal(new Set(f.calls.map(call=>JSON.stringify(call))).size,f.calls.length);
});
test('portfolio verifies native ownership and primary with one enumeration and no duplicate state reads',async()=>{
 const f=fixture(),p=await f.client.getPortfolio(owner,{bypassCache:true});
 assert.equal(p.ledgerHash,H);assert.equal(p.primary,'portfolio0.xah');assert.deepEqual(p.domains,[{domain:'portfolio0.xah',tokenId:f.tokens[0].index,uri:'portfolio0.xah',primary:true}]);
 assert.equal(f.calls.length,7);assert.equal(f.calls.filter(q=>q.command==='account_objects').length,1);
 const keys=f.calls.filter(q=>q.hook_state).map(q=>q.hook_state.key);assert.equal(new Set(keys).size,keys.length);
 const before=f.calls.length;await f.client.getPortfolio(owner,{bypassCache:true});assert.equal(f.calls.length-before,7);
});
test('portfolio keeps recovery, root-owner and primary mismatches fail-closed',async()=>{
 for(const mode of ['recovery','owner','primary']){
  const f=fixture();if(mode==='recovery')f.states.set(util.recoveryKey('portfolio0','xah'),Buffer.from([1]));
  if(mode==='owner'){const root=f.states.get(util.rootKey('portfolio0','xah'));root[0]^=1;}
  if(mode==='primary')f.states.set(util.primaryOfKey(owner),Buffer.alloc(32,3));
  await assert.rejects(f.client.getPortfolio(owner),e=>e.code==='OWNERSHIP_MISMATCH');
 }
});
test('portfolio validates canonical token mapping and does not trust token metadata identity',async()=>{
 const f=fixture();f.tokens[0].URI=Buffer.from('different.xah').toString('hex');
 await assert.rejects(f.client.getPortfolio(owner),e=>e.code==='OWNERSHIP_MISMATCH');
});
test('empty portfolio needs only ledger, primary and one account page',async()=>{
 const f=fixture(0);f.states.delete(util.primaryOfKey(owner));const p=await f.client.getPortfolio(owner);
 assert.deepEqual(p.domains,[]);assert.equal(p.primary,null);assert.equal(f.calls.length,3);
});

test('public primary lookups reuse identity reads while preserving forward-address verification',async()=>{
 const previous=fixture();previous.states.set(util.addrKey('portfolio0','xah',21337),Buffer.from(decodeAccountID(owner)));
 const oldOpts={ledgerHash:await previous.client.getLedgerHash(),bypassCache:true,verifyOwner:true},r=previous.client.resolver;
 // The former primary routine enumerated ownership, reread the root, then
 // verified the native owner and receiving record without shared state reads.
 await r.getPrimaryHash(owner,oldOpts);await r.listOwnedDomains(owner,oldOpts);await r.getRoot('portfolio0.xah',oldOpts);await r.getOwner('portfolio0.xah',oldOpts);await r.getAddr('portfolio0.xah',21337,oldOpts);
 assert.equal(previous.calls.length,15);
 const f=fixture();f.states.set(util.addrKey('portfolio0','xah',21337),Buffer.from(decodeAccountID(owner)));
 assert.equal(await f.client.getVerifiedPrimaryName(owner,{bypassCache:true}),'portfolio0.xah');
 assert.equal(f.calls.length,9);assert.equal(new Set(f.calls.map(call=>JSON.stringify(call))).size,f.calls.length);
 f.calls.length=0;assert.equal(await f.client.getPrimaryName(owner,{bypassCache:true}),'portfolio0.xah');assert.equal(f.calls.length,7);
 f.states.set(util.addrKey('portfolio0','xah',21337),Buffer.from(decodeAccountID(Wallet.generate().classicAddress)));
 assert.equal(await f.client.getVerifiedPrimaryName(owner,{bypassCache:true}),null);
 f.states.delete(util.primaryOfKey(owner));f.calls.length=0;assert.equal(await f.client.getVerifiedPrimaryName(owner,{bypassCache:true}),null);assert.equal(f.calls.length,2);
 console.log('Verified primary RPCs: 15 → 9; configured primary: 9 → 7');
});

test('concurrent pinned reads share only in-flight RPCs, clone results and release failures',async()=>{
 const f=fixture(),request=f.client.rawClient.request.bind(f.client.rawClient);let release;
 const gate=new Promise(resolve=>release=resolve);
 f.client.rawClient.request=async q=>{await gate;return request(q);};
 const opts={ledgerHash:H,bypassCache:true},key=util.rootKey('portfolio0','xah');
 const a=f.client.readState(key,opts),b=f.client.readState(key,opts);release();
 const [one,two]=await Promise.all([a,b]);assert.equal(f.calls.length,1);one[0]^=255;assert.notDeepEqual(one,two);
 await f.client.readState(key,opts);assert.equal(f.calls.length,2,'No cache between completed operations');
 f.calls.length=0;await Promise.all([f.client.readState('FF'.repeat(32),opts),f.client.readState('FF'.repeat(32),opts)]);assert.equal(f.calls.length,1);
 await f.client.readState('FF'.repeat(32),opts);assert.equal(f.calls.length,2,'Failed/missing request must not poison future reads');
 f.client.rawClient.request=async q=>{f.calls.push(q);return{result:{node:{HookStateData:'00'}}};};
 f.calls.length=0;await Promise.all([f.client.readState(key,{bypassCache:true}),f.client.readState(key,{bypassCache:true})]);assert.equal(f.calls.length,2,'Unpinned reads must stay fresh');
 f.calls.length=0;await Promise.all([f.client.readState(key,opts),f.client.readState(key,{...opts,ledgerHash:'CD'.repeat(32)})]);assert.equal(f.calls.length,2,'Different ledgers cannot share a request');
 let failures=0;f.client.rawClient.request=async()=>{failures++;throw Object.assign(Error('Invalid state'),{code:'BAD_STATE'});};
 const results=await Promise.allSettled([f.client.readState(key,opts),f.client.readState(key,opts)]);assert(results.every(r=>r.status==='rejected'));assert.equal(failures,1);
 await assert.rejects(f.client.readState(key,opts));assert.equal(failures,2);
});
test('quote reads price, status and TLD from one ledger',async()=>{
 const f=fixture(0),q=await f.client.checkDomain('available.xah',{bypassCache:true});
 assert.equal(q.status.stage,'available');assert.equal(q.priceDrops,1000000n);assert.equal(q.tldEnabled,true);assert.equal(q.ledgerHash,H);
 assert.equal(f.calls.length,12);assert(f.calls.slice(1).every(call=>call.ledger_hash===H));
 f.states.set(util.tldKey('xah'),Buffer.from([0]));assert.equal((await f.client.checkDomain('available.xah')).tldEnabled,false);
});
test('quote starts pricing and TLD reads before lifecycle status finishes',async()=>{
 const f=fixture(0),original=f.client.rawClient.request.bind(f.client.rawClient);let release;
 const gate=new Promise(resolve=>{release=resolve;});
 f.client.rawClient.request=async q=>{if(q.hook_state?.key===util.tokenKey('available','xah'))await gate;return original(q);};
 const pending=f.client.checkDomain('available.xah');await new Promise(setImmediate);
 assert(f.calls.some(q=>q.hook_state?.key===util.pricingKey()));assert(f.calls.some(q=>q.hook_state?.key===util.tldKey('xah')));
 release();await pending;
});
test('speculative URIBase failures are required only for an available name, not an existing legacy token',async()=>{
 const f=fixture(),request=f.client.rawClient.request.bind(f.client.rawClient);
 f.states.delete(util.tokenKey('portfolio0','xah'));
 f.client.rawClient.request=async q=>{if(q.hook_state?.key===util.uriBaseKey())throw Error('Base read unavailable');return request(q);};
 assert.equal((await f.client.registrar.getRegistrationStatus('portfolio0.xah')).stage,'claimed');
 await assert.rejects(f.client.registrar.getRegistrationStatus('available.xah'),/Base read unavailable/);
});
test('snapshot memoization is operation-local, clones buffers and rejects another ledger',async()=>{
 let reads=0;const original=Buffer.from([1]);const ctx={readState:async()=>{reads++;return original;},ledgerObject:async()=>null};
 const snapshot=snapshotContext(ctx,H),a=await snapshot.readState('AA',{ledgerHash:H});a[0]=9;
 assert.equal((await snapshot.readState('AA',{ledgerHash:H}))[0],1);assert.equal(reads,1);
 await assert.rejects(snapshot.readState('AA',{ledgerHash:'CD'.repeat(32)}),e=>e.code==='INVALID_ARGUMENT');
 await snapshotContext(ctx,H).readState('AA',{ledgerHash:H});assert.equal(reads,2);
});
test('portfolio fan-out is bounded and preserves order',async()=>{
 let active=0,peak=0;const result=await mapReads(Array.from({length:12},(_,i)=>i),async i=>{active++;peak=Math.max(peak,active);await new Promise(setImmediate);active--;return i;});
 assert.equal(peak,4);assert.deepEqual(result,Array.from({length:12},(_,i)=>i));
});
