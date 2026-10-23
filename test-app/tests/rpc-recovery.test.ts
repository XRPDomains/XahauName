import test from 'node:test';
import assert from 'node:assert/strict';
import {RegistrarModule} from '../../packages/sdk/src/registrar';
import {XahauNameClient} from '../../packages/sdk/src/index';
import {TESTNET} from '../../packages/sdk/src/deployments';
import {purchaseThenClaim} from '../../packages/sdk/src/purchase';
import {Wallet} from 'xahau';
import {createWalletKitRpcTransport} from '../../packages/sdk/src/wallet-kit';
import {waitValidated} from '../../packages/sdk/src/confirmation';
const timeout=()=>Object.assign(Error('Timeout for request'),{name:'TimeoutError'});
const disconnected=()=>Object.assign(Error('You need to be connected to a ledger'),{code:'UNKNOWN_ERROR'});

test('offer polling rereads lifecycle state only after the validated ledger changes',async()=>{
 let heads=0,statusReads=0;const first='AB'.repeat(32),next='CD'.repeat(32);
 const r=new RegistrarModule({ledgerHash:async()=>++heads<4?first:next} as any);
 r.getRegistrationStatus=async(_name,options)=>{statusReads++;return{stage:options?.ledgerHash===first?'pending':'awaitingClaim',ledgerHash:options?.ledgerHash} as any;};
 const state=await r.waitForOffer('alice.xah',{timeoutMs:200,pollIntervalMs:1});
 assert.equal(state.stage,'awaitingClaim');assert.equal(heads,4);assert.equal(statusReads,2);
});

test('SDK recovers concurrent disconnected reads once and preserves the pinned ledger',async()=>{
 const client=new XahauNameClient({...TESTNET}),rpc=client.rawClient;let connected=false,connects=0,verifications=0,reads=0;
 rpc.isConnected=()=>connected;rpc.connect=async()=>{connects++;await new Promise(resolve=>setTimeout(resolve,5));connected=true;rpc.networkID=TESTNET.expectedNetworkId;};
 rpc.request=(async(request:any)=>{
  if(!connected)throw disconnected();
  if(request.command==='account_objects'){verifications++;return{result:{account_objects:[{Hooks:Object.values(TESTNET.hookHashes!).map(HookHash=>({Hook:{HookHash}}))}]}};}
  reads++;assert.equal(request.ledger_hash,'AB'.repeat(32));return{result:{node:{HookStateData:'1234'}}};
 }) as any;
 const values=await Promise.all([client.readState('CD'.repeat(32),{ledgerHash:'AB'.repeat(32)}),client.readState('EF'.repeat(32),{ledgerHash:'AB'.repeat(32)})]);
 assert.deepEqual(values.map(value=>value?.toString('hex')),['1234','1234']);assert.equal(connects,1);assert.equal(verifications,1);assert.equal(reads,2);
});

test('SDK read recovery is bounded and fails closed on deployment mismatch',async()=>{
 const client=new XahauNameClient({...TESTNET}),rpc=client.rawClient;let calls=0;
 rpc.isConnected=()=>true;rpc.networkID=TESTNET.expectedNetworkId;
 rpc.request=(async(request:any)=>{calls++;if(request.command==='account_objects')return{result:{account_objects:[]}};throw disconnected();}) as any;
 rpc.disconnect=async()=>{};
 await assert.rejects(client.getLedgerHash(),(error:any)=>error.code==='DEPLOYMENT_MISMATCH');assert.equal(calls,2);
 const bare=new XahauNameClient({...TESTNET,hookHashes:undefined});bare.rawClient.isConnected=()=>true;bare.rawClient.networkID=TESTNET.expectedNetworkId;
 let attempts=0;bare.rawClient.request=(async()=>{attempts++;throw disconnected();}) as any;
 await assert.rejects(bare.getLedgerHash(),/connected to a ledger/);assert.equal(attempts,2);
});

test('a disconnected write reconnects before signing but never repeats an uncertain submission',async()=>{
 const client=new XahauNameClient({...TESTNET}),rpc=client.rawClient;let connected=false,connects=0,signatures=0;
 const hash='CD'.repeat(32);
 rpc.isConnected=()=>connected;rpc.connect=async()=>{connected=true;connects++;rpc.networkID=TESTNET.expectedNetworkId;};
 rpc.request=(async()=>({result:{account_objects:[{Hooks:Object.values(TESTNET.hookHashes!).map(HookHash=>({Hook:{HookHash}}))}]}})) as any;
 client.setSigner({address:Wallet.generate().classicAddress,signAndSubmit:async()=>{signatures++;throw Object.assign(disconnected(),{txHash:hash});}});
 await assert.rejects(client.submit({TransactionType:'Invoke'},{handler:'profile',returns:[0]} as any),(error:any)=>error.txHash===hash);
 assert.equal(connects,1);assert.equal(signatures,1);
});

test('Kit retries the reported UNKNOWN_ERROR only for reads, never submit',async()=>{
 let calls=0,readyCalls=0;const transport=createWalletKitRpcTransport({request:async()=>{calls++;if(calls===1)throw disconnected();return{result:{ok:true}};}},async()=>{readyCalls++;},'xahau-testnet');
 assert.deepEqual(await transport({id:'xahau-testnet'},'ledger',{}),{ok:true});assert.equal(calls,2);assert.equal(readyCalls,2);
 calls=0;await assert.rejects(transport({id:'xahau-testnet'},'submit',{}));assert.equal(calls,1);
});

test('confirmation tolerates disconnected reads and preserves hash on other failures',async()=>{
 const hash='AB'.repeat(32);let calls=0;
 const receipt=await waitValidated({request:async()=>{if(++calls===1)throw disconnected();return{result:{validated:true,meta:{TransactionResult:'tesSUCCESS'}}};}},hash,{timeoutMs:100,intervalMs:1});
 assert.equal(receipt.validated,true);assert.equal(calls,2);
 await assert.rejects(waitValidated({request:async()=>{throw Error('Invalid response');}},hash),(error:any)=>error.txHash===hash&&error.message==='Invalid response');
});

test('temporary RPC read failures while waiting for an offer do not end a paid purchase or repeat payment',async()=>{
 const r=new RegistrarModule({ledgerHash:async()=>'AB'.repeat(32)} as any);let reads=0,buys=0,claims=0;
 r.getRegistrationStatus=async()=>{reads++;if(reads<=2)throw timeout();return{stage:'awaitingClaim'} as any;};
 const result=await purchaseThenClaim({buy:async()=>{buys++;return{txHash:'AB'.repeat(32)};},waitForOffer:()=>r.waitForOffer('alice.xah',{timeoutMs:200,pollIntervalMs:1}),claim:async()=>{claims++;return'claimed';}},{label:'alice',tld:'xah'},{purchased:()=>{},claiming:()=>{}});
 assert.equal(result.pendingClaim,false);assert.equal(buys,1);assert.equal(claims,1);assert.equal(reads,3);
});
test('persistent RPC read failure retains a paid purchase as pending without another signature',async()=>{
 const r=new RegistrarModule({ledgerHash:async()=>'AB'.repeat(32)} as any);let buys=0,claims=0;
 r.getRegistrationStatus=async()=>{throw timeout();};
 const result=await purchaseThenClaim({buy:async()=>{buys++;return'paid';},waitForOffer:()=>r.waitForOffer('alice.xah',{timeoutMs:10,pollIntervalMs:1}),claim:async()=>{claims++;}},{label:'alice',tld:'xah'},{purchased:()=>{},claiming:()=>{}});
 assert.equal(result.pendingClaim,true);assert.equal(result.purchase,'paid');assert.equal(buys,1);assert.equal(claims,0);
});
test('wrong network and recovery states are not hidden by RPC read retry',async()=>{
 const r=new RegistrarModule({ledgerHash:async()=>'AB'.repeat(32)} as any);let reads=0;
 r.getRegistrationStatus=async()=>{reads++;throw Object.assign(Error('Wrong network'),{code:'WRONG_NETWORK'});};
 await assert.rejects(r.waitForOffer('alice.xah',{timeoutMs:200,pollIntervalMs:1}),(e:any)=>e.code==='WRONG_NETWORK');assert.equal(reads,1);
 r.getRegistrationStatus=async()=>({stage:'recoveryRequired'}) as any;
 await assert.rejects(r.waitForOffer('alice.xah',{timeoutMs:200,pollIntervalMs:1}),(e:any)=>e.code==='REGISTRATION_FAILED');
});
test('attaching and detaching a signer preserves one existing SDK transport',()=>{
 const client=new XahauNameClient({...TESTNET}),transport=client.rawClient;let connections=0;
 transport.connect=async()=>{connections++;};
 const address=Wallet.generate().classicAddress;
 client.setSigner({address,signAndSubmit:async()=>{throw Error('No signing in this test');}});
 assert.equal(client.signerAddress,address);assert.equal(client.rawClient,transport);
 client.setSigner(null);assert.equal(client.signerAddress,null);assert.equal(client.rawClient,transport);assert.equal(connections,0);
});
test('Kit transport retries a transient read once, checks network and never repeats submit',async()=>{
 let calls=0;const rpc={request:async()=>{calls++;if(calls===1)throw timeout();return{result:{ok:true}};}};
 const transport=createWalletKitRpcTransport(rpc,async()=>{},'xahau-testnet');
 assert.deepEqual(await transport({id:'xahau-testnet'},'server_info',{}),{ok:true});assert.equal(calls,2);
 calls=0;await assert.rejects(transport({id:'xahau-testnet'},'submit',{}));assert.equal(calls,1);
 calls=0;await assert.rejects(transport({id:'xahau-mainnet'},'server_info',{}));assert.equal(calls,0);
 const controller=new AbortController();controller.abort();await assert.rejects(transport({id:'xahau-testnet'},'server_info',{},controller.signal));assert.equal(calls,0);
});
