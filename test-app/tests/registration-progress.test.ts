import test from 'node:test';
import assert from 'node:assert/strict';
import type {RegistrationStatus} from '@xahauname/sdk';
import {checkoutFromLedger,checkoutActions,isUnstartedPurchase,isConfirmedFailure,definitiveWalletDecline,createPurchaseJournal,type PurchaseHint} from '../src/registration-progress';
import {registrationInput} from '../src/domain-input';
import {registrationProgress,registrationSuccess} from '../src/registration-view';
import {purchaseThenClaim} from '../src/purchase';

const account='rBnDiXzfeeXoujn38nSWHsYnQEaHyX8Ds',hash='AB'.repeat(32);
const status=(stage:RegistrationStatus['stage']):RegistrationStatus=>({stage,domain:'alice.xah',uritokenId:'CD'.repeat(32),ledgerHash:'EF'.repeat(32),recipient:account});
const hint:PurchaseHint={name:'alice.xah',account,paid:false,paymentHash:hash};
test('durable dispatch evidence separates retryable preflight failures from unknown wallet outcomes',()=>{
 const storage=memory(),journal=createPurchaseJournal(storage,'preflight');journal.save({name:'alice.xah',account,paid:false,paymentStarted:false});
 assert(isUnstartedPurchase(journal.get('alice.xah')));
 journal.save({...journal.get('alice.xah')!,paymentStarted:true});assert(!isUnstartedPurchase(journal.get('alice.xah')));
 for(const attempt of[{name:'alice.xah',account,paid:false},hint,{...hint,paymentStarted:false},{...hint,paid:true,paymentHash:undefined,paymentStarted:false}])assert(!isUnstartedPurchase(attempt));
 const offered=status('awaitingClaim'),unstartedClaim={...hint,paid:true,claimStarted:false};assert(checkoutActions(offered,checkoutFromLedger(offered,unstartedClaim),unstartedClaim,account,true).claim);
});

test('purchase orchestration preserves the exact price approved by its caller',async()=>{
 let passed:unknown;
 await purchaseThenClaim({buy:async args=>{passed=args.expectedPriceDrops;return{txHash:hash};},waitForOffer:async()=>{},claim:async()=>({txHash:hash})},{label:'alice',tld:'xah',expectedPriceDrops:25n},{purchased:()=>{},claiming:()=>{}});
 assert.equal(passed,25n);
});
function memory(){const values=new Map<string,string>();return{values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}

test('registration labels append the suffix exactly once and preserve pasted full names',()=>{
 assert.deepEqual(registrationInput(' Alice '),{label:'alice',tld:'xah',name:'alice.xah'});
 assert.deepEqual(registrationInput('ALICE.XAH'),{label:'alice',tld:'xah',name:'alice.xah'});
 assert.deepEqual(registrationInput('alice.xahau'),{label:'alice',tld:'xahau',name:'alice.xahau'});
 assert.equal(registrationInput('alice','xahau').name,'alice.xahau');
 for(const value of['','foo.bar.xah','alice.xah.xah','-alice','a'.repeat(58)])assert.throws(()=>registrationInput(value));
});
test('available names can start a wallet connection but cannot be bought again with any unresolved hint',()=>{
 const available=status('available');assert(checkoutActions(available,null,null,account,true).buy);assert(checkoutActions(available,null,null,undefined,true).buy);
 for(const attempt of[hint,{...hint,paid:true},{...hint,paymentHash:undefined}]){
  const state=checkoutFromLedger(available,attempt)!;
  assert.equal(state.phase,'uncertain');assert.equal(state.completed,0);
  assert(!checkoutActions(available,state,attempt,account,true).buy);
 }
 assert(!checkoutActions(available,null,null,account,false).buy);
});
test('claim and continuation require the actual recipient and verified lifecycle stage',()=>{
 const pending=status('pending'),offered=status('awaitingClaim');
 assert(checkoutActions(pending,checkoutFromLedger(pending,null),null,account,true).continue);
 assert(checkoutActions(offered,checkoutFromLedger(offered,null),null,account,true).claim);
 for(const wallet of[undefined,'rOtherWallet']){
  assert(!checkoutActions(offered,checkoutFromLedger(offered,null),null,wallet,true).claim);
  assert(!checkoutActions(pending,checkoutFromLedger(pending,null),null,wallet,true).continue);
 }
});
test('unknown claim attempts remain blocked even when no transaction hash was returned',()=>{
 for(const attempt of[{...hint,paid:true,claimStarted:true},{...hint,paid:true,claimHash:hash}]){
  const offered=status('awaitingClaim'),state=checkoutFromLedger(offered,attempt)!;
  assert.equal(state.phase,'uncertain');assert.equal(state.completed,2);
  assert(!checkoutActions(offered,state,attempt,account,true).claim);
  const pending=status('pending');assert(!checkoutActions(pending,checkoutFromLedger(pending,attempt),attempt,account,true).continue);
 }
});
test('refund and recovery cannot expose another payment or claim action',()=>{
 for(const stage of['refundPending','recoveryRequired'] as const){const value=status(stage),state=checkoutFromLedger(value,hint)!;assert.equal(state.phase,'attention');assert.deepEqual(checkoutActions(value,state,hint,account,true),{buy:false,claim:false,continue:false});}
});
test('only a validated failed engine result releases an uncertain attempt',()=>{
 assert(isConfirmedFailure({validated:true,meta:{TransactionResult:'tecHOOK_REJECTED'}}));
 for(const result of[{validated:false,meta:{TransactionResult:'tecHOOK_REJECTED'}},{meta:{TransactionResult:'tecUNFUNDED_PAYMENT'}},{validated:true,meta:{TransactionResult:'tesSUCCESS'}},{validated:true,meta:{TransactionResult:''}},{validated:true,meta:{TransactionResult:'unknown'}}])assert(!isConfirmedFailure(result));
});
test('wallet decline cannot be treated as safe cancellation when submission evidence exists',()=>{
 assert(definitiveWalletDecline({code:4001}));assert(definitiveWalletDecline({code:'SIGN_REJECTED'}));
 for(const details of[{txHash:hash},{outcomeUnknown:true},{providerRequestId:'request'}])assert(!definitiveWalletDecline({code:4001,details}));
 assert(!definitiveWalletDecline({code:'SIGN_FAILED'}));assert(!definitiveWalletDecline({code:4001,txHash:hash}));
 assert(definitiveWalletDecline({code:'SIGN_FAILED',cause:{code:4001}}));
 assert(!definitiveWalletDecline({code:'SIGN_FAILED',cause:{code:4001,details:{outcomeUnknown:true}}}));
 assert(!definitiveWalletDecline({code:'SIGN_REJECTED',cause:{details:{providerHash:hash}}}));
});
test('unknown claim guidance gives a concrete My names handoff without enabling another purchase',()=>{
 const attempt={...hint,paid:true,claimHash:undefined,claimStarted:true},offered=status('awaitingClaim'),state=checkoutFromLedger(offered,attempt)!;
 assert.match(state.message,/No claim hash/);assert.match(state.message,/My names → Ready to claim/);assert.match(state.message,/Do not buy again/);
 assert(!checkoutActions(offered,state,attempt,account,true).buy);assert(!checkoutActions(offered,state,attempt,account,true).claim);
});
test('purchase hints survive reload, are isolated by deployment, and do not authorize ownership',()=>{
 const storage=memory(),journal=createPurchaseJournal(storage,'testnet:A');journal.save({...hint,claimStarted:true});
 const restored=createPurchaseJournal(storage,'testnet:A').get('alice.xah')!;
 assert.equal(restored.paymentHash,hash);assert.equal(restored.claimStarted,true);
 assert.equal(createPurchaseJournal(storage,'mainnet:A').get('alice.xah'),null);
 assert.equal(checkoutFromLedger(status('available'),{...restored,paid:true})!.completed,0);
 journal.clear('alice.xah');assert.equal(journal.latest(),null);
});
test('the bounded journal refuses new attempts instead of evicting unresolved payments',()=>{
 const storage=memory(),journal=createPurchaseJournal(storage,'scope');
 for(let i=0;i<20;i++)journal.save({...hint,name:'name'+i+'.xah'});
 assert.throws(()=>journal.save({...hint,name:'extra.xah'}),/previous purchases/);
 assert(journal.get('name0.xah'));journal.save({...hint,name:'name0.xah',paid:true});assert(journal.get('name0.xah')!.paid);
});
test('a paid purchase with declined claim resumes as claim-only after reload',async()=>{
 const storage=memory(),journal=createPurchaseJournal(storage,'scope');let buys=0,claims=0;
 const result=await purchaseThenClaim({buy:async()=>{buys++;return{txHash:hash};},waitForOffer:async()=>{},claim:async()=>{claims++;throw Object.assign(new Error('Declined'),{code:4001});}},{label:'alice',tld:'xah'},{purchased:()=>journal.save({...hint,paid:true}),claiming:()=>{}});
 assert(result.pendingClaim);assert.equal(buys,1);assert.equal(claims,1);
 const restored=createPurchaseJournal(storage,'scope').get('alice.xah'),offered=status('awaitingClaim'),state=checkoutFromLedger(offered,restored);
 assert(checkoutActions(offered,state,restored,account,true).claim);assert(!checkoutActions(offered,state,restored,account,true).buy);
});
test('progress marks only confirmed steps and links hashes without invented percentages',()=>{
 const state=checkoutFromLedger(status('pending'),hint)!;
 const html=registrationProgress(state,value=>'https://example.com/tx/'+value);
 assert.equal((html.match(/class="is-complete"/g)??[]).length,1);
 assert(html.includes('Mint & offer'));assert(html.includes('aria-current="step"'));assert(html.includes(hash));
 assert(!html.includes('aria-valuenow'));assert(!/\d+%/.test(html));
 const complete=registrationProgress(checkoutFromLedger(status('claimed'),hint)!,()=>'/');
 assert.equal((complete.match(/class="is-complete"/g)??[]).length,3);
});

test('confirmed completion has only profile/new-name actions and its receipt, without stale purchase controls',()=>{
 const html=registrationSuccess('alice.xah',hash,value=>'https://example.com/'+value);
 assert(html.includes('Name received'));assert(html.includes('alice.xah'));assert(html.includes(hash));
 assert(html.includes('Manage name'));assert(html.includes('Buy another name'));
 assert(!html.includes('registration-steps'));assert(!html.includes('id="buy-name"'));assert(!html.includes('Check status'));assert(!html.includes('XAH'));
 assert(!html.includes('disabled'));assert.equal((registrationSuccess('alice.xah',hash,()=>'/receipt',true).match(/disabled/g)??[]).length,2);
});
