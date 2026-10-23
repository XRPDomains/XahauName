import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,decode} from 'xahau';
import {XahauNameClient} from '../../packages/sdk/src/index';
import {TESTNET} from '../../packages/sdk/src/deployments';
import {createWalletKitSigner} from '../../packages/sdk/src/wallet-kit';

// Real SDK, Xahau autofill, Kit manager, adapters and cryptographic verification.
// Only wallet-provider transports, RPC and domain-read fixtures are simulated.
const domain='pipeline.xah',parts={label:'pipeline',tld:'xah'},id='AB'.repeat(32),ledger='CD'.repeat(32);
type Mode='direct'|'gemwallet'|'xaman'|'xyra';
async function pipeline(mode:Mode,options:{queued?:boolean;extendExpiry?:number;change?:(tx:any)=>any;feePreparation?:'sdk'|'wallet-kit'}={}){
 const {WalletManager,MemoryWalletStorage}=await import('@xrpl-wallet-kit/core');
 const {createXahauProtocol,XAHAU_TESTNET}=await import('@xrpl-wallet-kit/xahau');
 const wallet=Wallet.generate(),other='rKMpMYo7yo7Xa4Bqmuf4BQRoeaf9TwkmDZ';
 const signedTransactions:any[]=[],providerTransactions:any[]=[],kitRequests:any[]=[];
 const rpcCalls:string[]=[];
 let manager:any,receipt:any,submitted=false,statusMode='owned',sequence=1,restoreWindow:(()=>void)|undefined;
 const hookMeta=(tx:any)=>{
  let handler='claim',ack=statusMode==='transfer'?'transferred':'claimed';
  if(tx.TransactionType==='Payment'){handler='issuance';ack='minting';}
  if(tx.TransactionType==='URITokenBurn'){handler='burn';ack='burned';}
  if(tx.TransactionType==='Invoke'){
   const op=tx.HookParameters?.find((p:any)=>p.HookParameter.HookParameterName==='6F70')?.HookParameter.HookParameterValue;
   const values:Record<string,string[]>={'03':['control','primary'],'04':['set-address','addr set'],'05':['set-address','addr cleared'],'06':['set-text','text set'],'07':['clear-text','text cleared'],'09':['control','reset']};
   [handler,ack]=values[op]??['control','noop'];
   if(tx.HookParameters?.some((p:any)=>p.HookParameter.HookParameterName==='70726F66696C65')){handler='profile';ack='profile set';}
  }
  return{TransactionResult:'tesSUCCESS',HookExecutions:[{HookExecution:{HookAccount:TESTNET.treasury,HookHash:(TESTNET.hookHashes as any)[handler],HookReturnCode:'0',HookReturnString:Buffer.from(ack).toString('hex'),HookResult:3}}]};
 };
 const request=async(method:string,params:any={})=>{
  rpcCalls.push(method);
  if(method==='server_info')return{info:{network_id:21338,validated_ledger:{seq:100,age:0}}};
  if(method==='ledger')return{ledger_index:100,ledger_hash:ledger,validated:true};
  if(method==='ledger_entry'){
   if(params.hook_state)throw Object.assign(Error('Fixture state entry absent'),{data:{error:'entryNotFound'}});
   return{node:{LedgerEntryType:'URIToken',Owner:other,Destination:wallet.classicAddress,Amount:'0'}};
  }
  if(method==='account_info')return{account_data:{Account:wallet.classicAddress,Sequence:sequence},...(params.queue&&options.queued&&!submitted?{queue_data:{txn_count:2,highest_sequence:2}}:{})};
  if(method==='fee')return{drops:{base_fee:'12',open_ledger_fee:'12',base_fee_no_hooks:'12'}};
  if(method==='submit'){
   const tx=decode(params.tx_blob);signedTransactions.push(tx);submitted=true;sequence=Number(tx.Sequence)+1;
   receipt={...tx,validated:true,hash:'EF'.repeat(32),meta:hookMeta(tx)};
   return{engine_result:'tesSUCCESS'};
  }
  if(method==='tx')return receipt;
  throw Error('Unexpected fixture RPC '+method);
 };
 const sign=(tx:any)=>{
  providerTransactions.push(structuredClone(tx));
  return wallet.sign(options.change?options.change(structuredClone(tx)):{...tx,LastLedgerSequence:tx.LastLedgerSequence+(options.extendExpiry??0)});
 };
 if(mode!=='direct'){
  let adapter:any;
  if(mode==='gemwallet'){
   const {createGemWalletAdapter}=await import('@xrpl-wallet-kit/adapter-gemwallet');
   adapter=createGemWalletAdapter({supportedChains:{families:['xahau']},provider:{
    isInstalled:async()=>({result:{isInstalled:true}}),getAddress:async()=>({result:{address:wallet.classicAddress}}),
    getPublicKey:async()=>({result:{address:wallet.classicAddress,publicKey:wallet.publicKey}}),
    getNetwork:async()=>({result:{chain:'XAHAU',network:'Testnet'}}),
    signTransaction:async(payload:any)=>({result:{signature:sign(payload.transaction).tx_blob}}),
   }});
  }else if(mode==='xaman'){
   const {createXamanAdapter}=await import('@xrpl-wallet-kit/adapter-xaman');let result:any;
   const sdk={payload:{createAndSubscribe:async(payload:any)=>{
    assert.equal(payload.options.submit,false);assert.equal(payload.options.force_network,'XAHAUTESTNET');
    const signed=sign(payload.txjson);result={meta:{signed:true,resolved:true},response:{hex:signed.tx_blob,txid:signed.hash,account:wallet.classicAddress}};
    return{created:{uuid:'pipeline-payload'},resolved:Promise.resolve({signed:true}),resolve:()=>{},websocket:{close(){}}};
   },get:async()=>result}};
   adapter=createXamanAdapter({sdk,auth:{authorize:async()=>({me:{sub:wallet.classicAddress,networkEndpoint:XAHAU_TESTNET.rpcUrl},sdk})},supportedChains:{families:['xahau']},recoveryStorage:new MemoryWalletStorage()});
  }else{
   const {createXyraAdapter}=await import('@xrpl-wallet-kit/adapter-xyra');
   const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
   Object.defineProperty(globalThis,'window',{configurable:true,value:{open:()=>({close(){}})}});
   restoreWindow=()=>{if(previous)Object.defineProperty(globalThis,'window',previous);else delete (globalThis as any).window;};
   adapter=createXyraAdapter({supportedChains:{families:['xahau']}});
   // Replace the popup transport only; adapter preparation/verification stay real.
   adapter.popup={pending:false,cancel(){},request:async(path:string,params:any)=>{
    if(path==='connect')return{address:wallet.classicAddress,publicKey:wallet.publicKey,network:'xahau-testnet'};
    assert.equal(path,'sign');const tx=JSON.parse(Buffer.from(params.tx,'base64').toString('utf8'));
    const signed=sign(tx);return{network:'xahau-testnet',tx_blob:signed.tx_blob,hash:signed.hash,submitted:false};
   }};
  }
  manager=new WalletManager({network:'xahau-testnet',networks:[XAHAU_TESTNET],protocols:[createXahauProtocol({request:async(_n,m,p)=>request(m,p)})],adapters:[adapter],storage:new MemoryWalletStorage(),accountStatus:{enabled:false},transactionConfirmation:{enabled:false},preflight:{maxFeeDrops:'1000000'},logger:{level:'silent'}});
  await manager.connect(mode);
  const original=manager.signAndSubmit.bind(manager);manager.signAndSubmit=async(input:any)=>{kitRequests.push(structuredClone(input));return original(input);};
 }
 let client:XahauNameClient;
 const signer=mode==='direct'?undefined:createWalletKitSigner(manager,{request:r=>client.rawClient.request(r),autofill:t=>client.rawClient.autofill(t)},{network:'xahau-testnet',networkId:21338,maxFeeDrops:'1000000',feePreparation:options.feePreparation??'wallet-kit'});
 client=new XahauNameClient({...TESTNET,...(signer?{signer}:{wallet})});
 const raw:any=client.rawClient;raw.networkID=21338;raw.isConnected=()=>true;raw.request=async(input:any)=>({result:await request(input.command,input)});
 // Preserve the real Client.autofill; replace only the transport-level ledger wait.
 raw.submitAndWait=async(blob:string)=>{await request('submit',{tx_blob:blob});return{result:receipt};};
 client.registrar.getPrice=async()=>1000000n;
 client.registrar.getRegistrationStatus=async()=>({domain,uritokenId:id,ledgerHash:ledger,...(statusMode==='claim'&&!submitted?{stage:'awaitingClaim',recipient:wallet.classicAddress}:{stage:'claimed',owner:statusMode==='transfer'&&!submitted?other:wallet.classicAddress,tokenOwner:statusMode==='transfer'&&!submitted?other:wallet.classicAddress})}) as any;
 return{client,other,address:wallet.classicAddress,signedTransactions,providerTransactions,kitRequests,rpcCalls,mode:(value:string)=>{statusMode=value;submitted=false;},close:()=>{try{manager?.destroy();}finally{restoreWindow?.();}}};
}
const operations:[string,(f:Awaited<ReturnType<typeof pipeline>>)=>Promise<any>][]=[
 ['buy',f=>f.client.registrar.buy(parts)],
 ['claim',f=>{f.mode('claim');return f.client.registrar.claim(domain);}],
 ['setText',f=>f.client.resolver.setText({...parts,key:'description',value:'Pipeline profile'})],
 ['setProfile',f=>f.client.resolver.setProfile({...parts,set:{display:'Pipeline.xah',description:'Profile through Wallet Kit'}})],
 ['setAddr',f=>f.client.resolver.setAddr({...parts,coinType:60,addr:Buffer.alloc(20,1)})],
 ['clearAddr',f=>f.client.resolver.clearAddr({...parts,coinType:60})],
 ['clearText',f=>f.client.resolver.clearText({...parts,key:'description'})],
 ['setPrimary',f=>f.client.resolver.setPrimary({...parts,flag:true})],
 ['reset',f=>f.client.resolver.reset(parts)],
 ['transfer offer',f=>f.client.registrar.createTransferOffer(domain,f.other)],
 ['cancel transfer',f=>f.client.registrar.cancelTransferOffer(domain)],
 ['accept transfer',f=>{f.mode('transfer');return f.client.registrar.acceptTransfer(domain);}],
 ['burn',f=>f.client.registrar.burn(domain)],
];
test('audit real Wallet Kit 0.2.2 RPC preparation and confirmation by adapter',async()=>{
 for(const mode of ['gemwallet','xaman','xyra'] as const){
  const f=await pipeline(mode);try{
   await f.client.registrar.buy(parts);
   const counts=f.rpcCalls.reduce<Record<string,number>>((out,method)=>(out[method]=(out[method]??0)+1,out),{});
   console.log(JSON.stringify({walletKitRpcAudit:mode,total:f.rpcCalls.length,counts,sequence:f.rpcCalls}));
   assert.equal(counts.submit,1);assert.equal(f.signedTransactions.length,1);
  }finally{f.close();}
 }
});
function intent(tx:any){const copy={...tx};for(const key of ['Account','Sequence','LastLedgerSequence','Fee','SigningPubKey','TxnSignature','NetworkID','Flags'])delete copy[key];return copy;}
for(const mode of ['gemwallet','xaman','xyra'] as const)for(const [name,run]of operations)test(`${name}: direct SDK and real ${mode} manager/adapter preserve the same domain transaction`,async()=>{
 const direct=await pipeline('direct'),kit=await pipeline(mode,{extendExpiry:mode==='xyra'?0:10});
 try{
  const a=await run(direct),b=await run(kit);assert.equal(a.engineResult,'tesSUCCESS');assert.equal(b.engineResult,'tesSUCCESS');
  assert.equal(direct.signedTransactions.length,1);assert.equal(kit.signedTransactions.length,1);assert.equal(kit.providerTransactions.length,1);
  assert.deepEqual(intent(kit.signedTransactions[0]),intent(direct.signedTransactions[0]));
  assert.equal(kit.signedTransactions[0].Account,kit.address);assert.equal(kit.signedTransactions[0].NetworkID,21338);assert.equal(kit.signedTransactions[0].Fee,'12');
  assert.equal(kit.kitRequests[0].maxFeeDrops,'1000000');
  for(const field of ['Sequence','LastLedgerSequence','Flags'])assert.equal(kit.kitRequests[0].txJson[field],undefined);
  assert.equal(kit.signedTransactions[0].Flags,2147483648);
 }finally{direct.close();kit.close();}
});
test('real Kit chooses the next sequence after queued transactions instead of SDK fee-estimate sequence',async()=>{
 const f=await pipeline('gemwallet',{queued:true});try{await f.client.registrar.buy(parts);assert.equal(f.signedTransactions[0].Sequence,3);}finally{f.close();}
});
test('explicit caller sequence and flags remain strict through the real Kit adapter',async()=>{
 const f=await pipeline('gemwallet');try{
  const result=await (f.client as any).signer.signAndSubmit({TransactionType:'Invoke',Destination:TESTNET.treasury,Sequence:1,Flags:0,LastLedgerSequence:120});
  assert.equal(result.validated,true);assert.equal(f.kitRequests[0].txJson.Sequence,1);assert.equal(f.kitRequests[0].txJson.Flags,0);assert.equal(f.kitRequests[0].txJson.LastLedgerSequence,120);
  assert.equal(f.signedTransactions[0].Flags,0);
 }finally{f.close();}
});
test('a changed payment Amount is blocked by the real manager and adapter with no submit or automatic retry',async()=>{
 const f=await pipeline('gemwallet',{change:tx=>({...tx,Amount:'2000000'})});try{
  await assert.rejects(f.client.registrar.buy(parts),(error:any)=>error.code==='SIGN_FAILED');
  assert.equal(f.signedTransactions.length,0);assert.equal(f.providerTransactions.length,1);assert.equal(f.kitRequests.length,1);
 }finally{f.close();}
});
for(const mode of ['gemwallet','xaman','xyra'] as const)test(`${mode}: sequential buy then claim uses two approvals and the next ledger sequence`,async()=>{
 const f=await pipeline(mode);try{
  await f.client.registrar.buy(parts);f.mode('claim');await f.client.registrar.claim(domain);
  assert.deepEqual(f.signedTransactions.map(tx=>tx.TransactionType),['Payment','URITokenBuy']);
  assert.deepEqual(f.signedTransactions.map(tx=>tx.Sequence),[1,2]);assert.equal(f.providerTransactions.length,2);
 }finally{f.close();}
});
test('Kit-owned preparation removes three redundant RPCs without removing network verification',async()=>{
 const before=await pipeline('gemwallet',{feePreparation:'sdk'}),after=await pipeline('gemwallet');
 try{
  await before.client.registrar.buy(parts);await after.client.registrar.buy(parts);
  assert.equal(before.rpcCalls.length-after.rpcCalls.length,3);
  assert.equal(after.rpcCalls.filter(c=>c==='server_info').length,before.rpcCalls.filter(c=>c==='server_info').length);
  assert.equal(after.rpcCalls.filter(c=>c==='tx').length,1);
  console.log('Signing/confirmation RPC count: '+before.rpcCalls.length+' → '+after.rpcCalls.length);
 }finally{before.close();after.close();}
});
