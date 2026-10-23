import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTestnet,createWalletSigner as createAppWalletSigner,waitValidated,NETWORK,MAX_FEE} from '../src/wallet-signer';
import {createWalletKitSigner} from '../../packages/sdk/src/wallet-kit';
const createWalletSigner=(manager:any,rpc:any,submitted:(hash:string)=>void)=>createWalletKitSigner(manager,rpc,{network:NETWORK,networkId:21338,maxFeeDrops:MAX_FEE,onSubmitted:submitted});
const address='rTest', hash='AB'.repeat(32);
function fixture(){let signs=0;const manager={getAccount:()=>({address,network:{id:'xahau-testnet'}}),getNetwork:()=>({id:'xahau-testnet'}),signAndSubmit:async()=>{signs++;return{hash};}};const rpc={autofill:async(tx:any)=>({...tx,Fee:'12'}),request:async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'12',TransactionType:'Invoke',meta:{TransactionResult:'tesSUCCESS',HookExecutions:[]}}})};return{manager,rpc,signs:()=>signs};}
test('app delegates fee preparation to Kit, caps the receipt and ignores observer failures',async()=>{
 const f=fixture();let autofills=0,request:any;
 f.rpc.autofill=async(tx:any)=>{autofills++;return{...tx,Fee:'12'};};
 f.manager.signAndSubmit=async(input?:any)=>{request=input;return{hash};};
 const result=await createAppWalletSigner(f.manager,f.rpc,()=>{throw Error('UI observer failed');},()=>{throw Error('UI observer failed');}).signAndSubmit({TransactionType:'Invoke'});
 assert.equal(result.validated,true);assert.equal(autofills,0);assert.equal(request.txJson.Fee,undefined);assert.equal(request.maxFeeDrops,MAX_FEE);
 f.rpc.request=async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'1000001',TransactionType:'Invoke',meta:{TransactionResult:'tesSUCCESS',HookExecutions:[]}}});
 await assert.rejects(createAppWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'}),e=>(e as any).txHash===hash);
});
test('rejects wrong network before requesting signature',async()=>{const f=fixture();f.manager.getNetwork=()=>({id:'xahau-mainnet'});assert.throws(()=>assertTestnet(f.manager));assert.equal(f.signs(),0);});
test('SDK receives validated metadata, never preliminary success',async()=>{const f=fixture(),seen:string[]=[];const s=createWalletSigner(f.manager,f.rpc,h=>seen.push(h));const r=await s.signAndSubmit({TransactionType:'Invoke'});assert.equal(r.validated,true);assert.equal(r.engineResult,'tesSUCCESS');assert.deepEqual(seen,[hash]);assert.equal(f.signs(),1);});
test('account change invalidates captured signer',async()=>{const f=fixture(),s=createWalletSigner(f.manager,f.rpc,()=>{});f.manager.getAccount=()=>({address:'different',network:{id:'xahau-testnet'}});await assert.rejects(s.signAndSubmit({TransactionType:'Invoke'}));assert.equal(f.signs(),0);});
test('wrong NetworkID and excessive fee never prompt wallet',async()=>{const f=fixture(),s=createWalletSigner(f.manager,f.rpc,()=>{});await assert.rejects(s.signAndSubmit({TransactionType:'Invoke',NetworkID:21337}));await assert.rejects(s.signAndSubmit({TransactionType:'Invoke',Fee:'1000001'}));assert.equal(f.signs(),0);});
test('does not accept a validated transaction from another account',async()=>{const f=fixture();f.rpc.request=async()=>({result:{validated:true,Account:'other',NetworkID:21338,Fee:'12',TransactionType:'Invoke',meta:{TransactionResult:'tesSUCCESS',HookExecutions:[]}}});await assert.rejects(createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'}));assert.equal(f.signs(),1);});
test('unvalidated result remains uncertain and includes its hash',async()=>{let reads=0;const rpc={request:async()=>{reads++;return{result:{validated:false}};}};await assert.rejects(waitValidated(rpc,hash,{timeoutMs:5,intervalMs:6}),e=>(e as any).txHash===hash);assert(reads>=1);});
test('validated rejection is returned to SDK for hook error decoding',async()=>{const f=fixture();f.rpc.request=async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'12',TransactionType:'Invoke',meta:{TransactionResult:'tecHOOK_REJECTED',HookExecutions:[]}}});const r=await createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'});assert.equal(r.engineResult,'tecHOOK_REJECTED');assert.equal(f.signs(),1);});

test('validated receipt cannot substitute destination, amount or HookParameters',async()=>{for(const field of ['Destination','Amount','HookParameters']){const f=fixture(),requested:any={TransactionType:'Invoke',Destination:'rExpected',Amount:'12',HookParameters:[{HookParameter:{HookParameterName:'AA',HookParameterValue:'BB'}}]},actual:any={...requested,Account:address,NetworkID:21338,Fee:'12'};actual[field]=field==='HookParameters'?[]:'different';f.rpc.request=async()=>({result:{...actual,validated:true,meta:{TransactionResult:'tesSUCCESS'}}});await assert.rejects(createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit(requested),e=>(e as any).txHash===hash);assert.equal(f.signs(),1);}});

for(const fee of ['1000001','-1','1.2','1e3','',undefined])test('wallet-filled fee is checked before signing: '+fee,async()=>{const f=fixture();f.rpc.autofill=async(tx:any)=>({...tx,Fee:fee});await assert.rejects(createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'}));assert.equal(f.signs(),0);});
test('request-only transport fails closed without an explicit fee',async()=>{const f=fixture();await assert.rejects(createWalletSigner(f.manager,{request:f.rpc.request},()=>{}).signAndSubmit({TransactionType:'Invoke'}),/Fee unavailable/);assert.equal(f.signs(),0);});
test('autofilled fee is passed to wallet and cannot be changed in the receipt',async()=>{const f=fixture();let requested:any;f.manager.signAndSubmit=async function(request?:any){requested=request.txJson;return{hash};};await createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'});assert.equal(requested.Fee,'12');f.rpc.request=async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'1000001',TransactionType:'Invoke',meta:{TransactionResult:'tesSUCCESS',HookExecutions:[]}}});await assert.rejects(createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'}));});
test('session is rechecked after asynchronous fee preparation',async()=>{const f=fixture();f.rpc.autofill=async(tx:any)=>{f.manager.getAccount=()=>({address:'other',network:{id:'xahau-testnet'}});return {...tx,Fee:'12'};};await assert.rejects(createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'}));assert.equal(f.signs(),0);});

test('SDK fee estimation does not impose an explicit Wallet Kit expiry',async()=>{
 const f=fixture();let requested:any;
 f.rpc.autofill=async(tx:any)=>({...tx,Fee:'12',LastLedgerSequence:120});
 f.manager.signAndSubmit=async(request?:any)=>{requested=request.txJson;return{hash};};
 f.rpc.request=async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'12',TransactionType:'Invoke',LastLedgerSequence:130,meta:{TransactionResult:'tesSUCCESS'}}});
 await createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'});
 assert.equal(requested.LastLedgerSequence,undefined);assert.equal(requested.Fee,'12');
});
test('explicit caller expiry is preserved in the request and validated receipt',async()=>{
 const f=fixture();let requested:any;
 f.manager.signAndSubmit=async(request?:any)=>{requested=request.txJson;return{hash};};
 f.rpc.request=async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'12',TransactionType:'Invoke',LastLedgerSequence:120,meta:{TransactionResult:'tesSUCCESS'}}});
 await createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke',LastLedgerSequence:120});
 assert.equal(requested.LastLedgerSequence,120);
 f.rpc.request=async()=>({result:{validated:true,Account:address,NetworkID:21338,Fee:'12',TransactionType:'Invoke',LastLedgerSequence:130,meta:{TransactionResult:'tesSUCCESS'}}});
 await assert.rejects(createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke',LastLedgerSequence:120}),error=>(error as any).txHash===hash);
});
test('fee autofill metadata does not become explicit Kit signing intent and fee ceiling is passed to manager',async()=>{
 const f=fixture();let requested:any;
 f.rpc.autofill=async(tx:any)=>({...tx,Fee:'12',Sequence:1,Flags:0,LastLedgerSequence:120});
 f.manager.signAndSubmit=async(request?:any)=>{requested=request;return{hash};};
 await createWalletSigner(f.manager,f.rpc,()=>{}).signAndSubmit({TransactionType:'Invoke'});
 assert.deepEqual(requested,{txJson:{TransactionType:'Invoke',Account:address,NetworkID:21338,Fee:'12'},maxFeeDrops:'1000000'});
});
