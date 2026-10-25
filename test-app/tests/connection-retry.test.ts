import test from 'node:test';
import assert from 'node:assert/strict';
import {XahauNameClient} from '../../packages/sdk/src/index';
import {TESTNET} from '../../packages/sdk/src/deployments';

const timeout=()=>Object.assign(new Error('Error: connect() timed out after 6000 ms.'),{name:'ConnectionError'});
function fixture(){
 const client=new XahauNameClient({...TESTNET,connectionTimeoutMs:6000,connectionAttempts:2}),rpc=client.rawClient;
 let connected=false,cleanups=0,verifications=0;
 rpc.isConnected=()=>connected;
 rpc.disconnect=async()=>{cleanups++;connected=false;};
 rpc.request=(async()=>{verifications++;return{result:{account_objects:[{Hooks:Object.values(TESTNET.hookHashes!).map(HookHash=>({Hook:{HookHash}}))}]}};}) as any;
 return{client,rpc,setConnected:(value:boolean)=>connected=value,stats:()=>({cleanups,verifications})};
}
test('concurrent connection callers share one bounded transport retry and verify deployment once',async()=>{
 const f=fixture();let attempts=0;
 f.rpc.connect=async()=>{attempts++;await new Promise(setImmediate);if(attempts===1)throw timeout();f.setConnected(true);f.rpc.networkID=21338;};
 await Promise.all([f.client.connect(),f.client.connect(),f.client.connect()]);
 assert.equal(attempts,2);assert.deepEqual(f.stats(),{cleanups:1,verifications:1});
});
test('repeated handshake failure stops after two attempts, cleans transport and exposes attempts',async()=>{
 const f=fixture();let attempts=0;f.rpc.connect=async()=>{attempts++;throw timeout();};
 await assert.rejects(f.client.connect(),(error:any)=>error.code==='RPC_CONNECTION_FAILED'&&error.details.attempts===2);
 assert.equal(attempts,2);assert.deepEqual(f.stats(),{cleanups:2,verifications:0});
});
test('wrong network is never retried or used for deployment reads',async()=>{
 const f=fixture();let attempts=0;f.rpc.connect=async()=>{attempts++;f.setConnected(true);f.rpc.networkID=21337;};
 await assert.rejects(f.client.connect(),(error:any)=>error.code==='WRONG_NETWORK');assert.equal(attempts,1);assert.equal(f.stats().verifications,0);
});
test('facade waits for an open transport to finish network/deployment verification',async()=>{
 const f=fixture();let finish!:()=>void,reads=0;
 f.rpc.connect=async()=>{f.setConnected(true);await new Promise<void>(resolve=>finish=resolve);f.rpc.networkID=21338;};
 f.rpc.request=(async(q:any)=>{
  if(q.command==='account_objects')return{result:{account_objects:[{Hooks:Object.values(TESTNET.hookHashes!).map(HookHash=>({Hook:{HookHash}}))}]}};
  reads++;if(q.command==='ledger')return{result:{ledger_hash:'AB'.repeat(32)}};
  throw {data:{error:'entryNotFound'}};
 }) as any;
 const connecting=f.client.connect();await new Promise(setImmediate);const owner=f.client.read.getOwner({name:'alice.xah'});await new Promise(setImmediate);assert.equal(reads,0);
 finish();await connecting;assert.equal(await owner,null);
});
