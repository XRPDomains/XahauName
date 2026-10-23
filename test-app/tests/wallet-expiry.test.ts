import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,decode} from 'xahau';
import {createWalletKitSigner} from '../../packages/sdk/src/wallet-kit';
import {TESTNET} from '../../packages/sdk/src/deployments';

// Real Kit protocol/signature verification; simulated wallet and RPC, no broadcasts.
async function setup(change:(tx:any)=>any){
 const {createXahauProtocol,XAHAU_TESTNET}=await import('@xrpl-wallet-kit/xahau');
 const {prepareProtocolTransaction,verifyProtocolTransaction}=await import('@xrpl-wallet-kit/core');
 const wallet=Wallet.generate(),account={address:wallet.classicAddress,publicKey:wallet.publicKey,network:XAHAU_TESTNET};
 let submits=0,signs=0,reads=0,receipt:any,requested:any;
 const protocol=createXahauProtocol({request:async(_network,method,params)=>{
  if(method==='server_info')return{info:{network_id:21338,validated_ledger:{seq:100,age:0}}};
  if(method==='account_info')return{account_data:{Account:account.address,Sequence:1}};
  if(method==='fee')return{drops:{base_fee:'12',open_ledger_fee:'12'}};
  if(method==='submit'){submits++;receipt={...decode(String(params.tx_blob)),validated:true,meta:{TransactionResult:'tesSUCCESS'}};return{engine_result:'tesSUCCESS'};}
  throw Error('Unexpected RPC method '+method);
 }});
 const context={protocol,network:XAHAU_TESTNET};
 const manager={getAccount:()=>account,getNetwork:()=>XAHAU_TESTNET,signAndSubmit:async(input:{txJson:Record<string,unknown>})=>{
  requested=structuredClone(input.txJson);
  const request={...input,maxFeeDrops:'1000000'};
  const prepared=await prepareProtocolTransaction(context,request,account);
  signs++;const signed=wallet.sign(change(structuredClone(prepared)));
  const verified=await verifyProtocolTransaction(context,request,account,prepared,signed.tx_blob);
  return protocol.submit(verified.txBlob,XAHAU_TESTNET,request);
 }};
 const rpc={autofill:async(tx:any)=>({...tx,Fee:'12',Sequence:1,LastLedgerSequence:120}),request:async()=>{reads++;return{result:receipt};}};
 return{signer:createWalletKitSigner(manager,rpc,{network:'xahau-testnet',networkId:21338,maxFeeDrops:'1000000'}),counts:()=>({submits,signs,reads}),requested:()=>requested};
}
const payment={TransactionType:'Payment',Destination:TESTNET.treasury,Amount:'1000000',HookParameters:[{HookParameter:{HookParameterName:'7632',HookParameterValue:'01'}}]};

test('actual Kit verifier accepts bounded wallet expiry extension after SDK fee estimation',async()=>{
 const f=await setup(tx=>({...tx,LastLedgerSequence:tx.LastLedgerSequence+10}));
 const result=await f.signer.signAndSubmit(payment);
 assert.equal(f.requested().LastLedgerSequence,undefined);assert.equal(f.requested().Fee,'12');
 assert.equal(result.validated,true);assert.equal(result.engineResult,'tesSUCCESS');assert.deepEqual(f.counts(),{signs:1,submits:1,reads:1});
});
test('actual Kit verifier reproduces the reported error for changed explicit expiry before submit',async()=>{
 const f=await setup(tx=>({...tx,LastLedgerSequence:tx.LastLedgerSequence+10}));
 await assert.rejects(f.signer.signAndSubmit({...payment,LastLedgerSequence:120}),(error:any)=>error.code==='SIGN_FAILED'&&error.message==='Xahau verification failed: Signed fields changed: LastLedgerSequence');
 assert.deepEqual(f.counts(),{signs:1,submits:0,reads:0});assert.equal(f.requested().LastLedgerSequence,120);
});
test('actual Kit verifier accepts an unchanged explicit caller deadline',async()=>{
 const f=await setup(tx=>tx);const result=await f.signer.signAndSubmit({...payment,LastLedgerSequence:120});
 assert.equal(result.validated,true);assert.equal(f.requested().LastLedgerSequence,120);assert.equal(f.counts().submits,1);
});
test('Kit rechecks the ledger window even when the expiry extension is within its allowance',async()=>{
 const f=await setup(tx=>({...tx,LastLedgerSequence:151}));
 await assert.rejects(f.signer.signAndSubmit(payment),/expiry is outside the permitted window/);
 assert.equal(f.counts().submits,0);assert.equal(f.counts().signs,1);
});
for(const field of ['Amount','Destination','Fee','HookParameters','NetworkID','LastLedgerSequence'])test('actual Kit verification still rejects unauthorized change to '+field,async()=>{
 const f=await setup(tx=>({...tx,LastLedgerSequence:130,[field]:field==='Amount'?'2000000':field==='Destination'?'rKMpMYo7yo7Xa4Bqmuf4BQRoeaf9TwkmDZ':field==='Fee'?'13':field==='HookParameters'?[]:field==='NetworkID'?21337:200}));
 await assert.rejects(f.signer.signAndSubmit(payment),(error:any)=>error.code==='SIGN_FAILED');assert.equal(f.counts().submits,0);assert.equal(f.counts().signs,1);assert.equal(f.counts().reads,0);
});
