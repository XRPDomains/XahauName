import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTransferRecipient,createTransferRecipientPreview,type RecipientPreviewState} from '../src/transfer-recipient';
const address='rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs';
test('classic wallet input does not make a resolution request',async()=>{
 assert.deepEqual(await resolveTransferRecipient(' '+address+' ',async()=>{throw new Error('Unexpected RPC');}),{address});
});
test('domain input uses its current owner without needing any address records',async()=>{
 const calls:string[]=[];
 assert.deepEqual(await resolveTransferRecipient(' Alice.XAH ',async name=>{calls.push(name);return address;}),{domain:'alice.xah',address});
 assert.deepEqual(calls,['alice.xah']);
});
test('bare names receive the default suffix',async()=>{
 assert.equal((await resolveTransferRecipient('alice',async name=>{assert.equal(name,'alice.xah');return address;})).domain,'alice.xah');
});
test('domains without a verified owner cannot receive a transfer',async()=>{
 await assert.rejects(resolveTransferRecipient('alice.xah',async()=>null),/no verified owner/);
});
test('malformed wallet and invalid resolved address are rejected',async()=>{
 await assert.rejects(resolveTransferRecipient('r'+'a'.repeat(32),async()=>{throw new Error('Unexpected RPC');}),/valid wallet address/);
 await assert.rejects(resolveTransferRecipient('alice.xah',async()=>'not-an-address'),/invalid owner address/);
});

function deferred(){let resolve!:(value:string|null)=>void,reject!:(error:Error)=>void;const promise=new Promise<string|null>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
test('change and blur share one lookup, including a submit while lookup is pending',async()=>{
 const request=deferred(),states:RecipientPreviewState[]=[];let calls=0;
 const preview=createTransferRecipientPreview(async()=>{calls++;return request.promise;},state=>states.push(state));
 const change=preview.resolve('alice.xah'),blur=preview.resolve('alice.xah'),submit=preview.resolve('alice.xah');
 assert.equal(change,blur);assert.equal(change,submit);assert.equal(calls,1);
 request.resolve(address);await change;
 assert.deepEqual(await preview.resolve('alice.xah'),{domain:'alice.xah',address});assert.equal(calls,1);
 assert.deepEqual(states.map(s=>s.status),['loading','ready']);
});
test('late replies cannot overwrite an edited recipient or a closed dialog',async()=>{
 const old=deferred(),next=deferred(),states:RecipientPreviewState[]=[];
 const preview=createTransferRecipientPreview(name=>name==='old.xah'?old.promise:next.promise,state=>states.push(state));
 const first=preview.resolve('old.xah');preview.reset();const second=preview.resolve('next.xah');
 old.resolve(address);assert.equal(await first,null);assert.equal(preview.state.status,'loading');
 preview.reset();next.resolve(address);assert.equal(await second,null);assert.equal(preview.state.status,'idle');
 assert(!states.some(state=>state.status==='ready'));
});
test('failed automatic lookup can be retried; stale failures stay silent',async()=>{
 const request=deferred();let calls=0;
 const preview=createTransferRecipientPreview(async()=>++calls===1?request.promise:address,()=>{});
 const stale=preview.resolve('old.xah');preview.reset();request.reject(new Error('Disconnected'));
 assert.equal(await stale,null);assert.equal(preview.state.status,'idle');
 const missing=createTransferRecipientPreview(async()=>null,()=>{});
 await assert.rejects(missing.resolve('missing.xah'),/no verified owner/);assert.equal(missing.state.status,'error');
 assert.deepEqual(await preview.resolve('alice.xah'),{domain:'alice.xah',address});
});
