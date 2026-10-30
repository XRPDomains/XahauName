import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityResolver} from '../src/wallet-identity';
import {CHAIN} from '../src/config';
const address='rBnDiXzfeeXoujn38nSWHsYnQEaHyX8Ds';
const session:any={adapterId:'gemwallet',connectedAt:0,account:{address,network:{id:CHAIN.walletKitId,family:'xahau',networkId:CHAIN.networkId}}};
function fixture(value:string|null='alice.xah'){
 const calls:any[]=[];
 const client:any={read:{getName:async(args:any)=>{calls.push(args);return value;}}};
 return {calls,client};
}
test('wallet identity uses the shared SDK verified primary without receiving records',async()=>{
 const {client,calls}=fixture();const resolve=createIdentityResolver(client);
 assert.deepEqual(await resolve(address,session),{name:'alice.xah',source:'xahauname',verified:true});
 assert.deepEqual(calls,[{address,name:undefined,bypassCache:false}]);
});
test('wallet identity verifies candidates and rediscovers primary on forced refresh',async()=>{
 const {client,calls}=fixture();const resolve=createIdentityResolver(client,()=> 'alice.xah');
 await resolve(address,session);await resolve(address,session,{force:true});assert.deepEqual(calls,[{address,name:'alice.xah',bypassCache:false},{address,name:undefined,bypassCache:true}]);
});
test('missing primary returns no identity and SDK failures remain failures',async()=>{
 const {client}=fixture(null);assert.equal(await createIdentityResolver(client)(address,session),null);
 client.read.getName=async()=>{throw Error('Ownership mismatch');};
 await assert.rejects(createIdentityResolver(client)(address,session),/Ownership mismatch/);
});
test('different wallet, family or network never queries the identity SDK',async()=>{
 const {client,calls}=fixture(),resolve=createIdentityResolver(client);
 assert.equal(await resolve('rOther',session),null);
 for(const change of [{id:'other'},{family:'xrpl'},{networkId:-1}]){
  const changed={...session,account:{...session.account,network:{...session.account.network,...change}}};
  assert.equal(await resolve(address,changed),null);
 }
 assert.equal(calls.length,0);
});
