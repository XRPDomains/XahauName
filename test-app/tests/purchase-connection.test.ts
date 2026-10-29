import test from 'node:test';
import assert from 'node:assert/strict';
import {connectThenPurchase} from '../src/purchase-connection';

test('an explicit buy connects and binds before requesting one purchase',async()=>{
 const calls:string[]=[];
 await connectThenPurchase({isCurrent:()=>true,hasAccount:()=>false,connect:async()=>{calls.push('connect');},bind:async()=>{calls.push('bind');},buy:async()=>{calls.push('buy');}});
 assert.deepEqual(calls,['connect','bind','buy']);
});
test('connected wallets skip the picker and still bind before buying',async()=>{
 const calls:string[]=[];
 await connectThenPurchase({isCurrent:()=>true,hasAccount:()=>true,connect:async()=>{throw Error('Unexpected picker');},bind:async()=>{calls.push('bind');},buy:async()=>{calls.push('buy');}});
 assert.deepEqual(calls,['bind','buy']);
});
test('cancelled connection never binds or schedules a deferred payment',async()=>{
 let buys=0,binds=0;
 await assert.rejects(connectThenPurchase({isCurrent:()=>true,hasAccount:()=>false,connect:async()=>{throw Error('Picker closed');},bind:async()=>{binds++;},buy:async()=>{buys++;}}),/Picker closed/);
 await Promise.resolve();assert.equal(buys,0);assert.equal(binds,0);
});
test('navigation or name changes during connection/binding prevent payment',async()=>{
 for(const stage of ['connect','bind']){
  let current=true,buys=0;
  await assert.rejects(connectThenPurchase({isCurrent:()=>current,hasAccount:()=>false,connect:async()=>{if(stage==='connect')current=false;},bind:async()=>{if(stage==='bind')current=false;},buy:async()=>{buys++;}}),/page changed/);
  assert.equal(buys,0);
 }
});
