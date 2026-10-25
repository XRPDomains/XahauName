import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActivityHistory} from '../src/activity';
test('activity retains a bounded count and detaches caller-owned receipt metadata',()=>{
 const history=new ActivityHistory(30),details={value:'before'};history.add({label:'first',result:'ok',details});details.value='after';assert.equal((history.recent()[0].details as typeof details).value,'before');
 for(let i=0;i<1000;i++)history.add({label:String(i),result:'ok',details:{meta:'x'.repeat(20000)}});assert.equal(history.size,30);assert.equal(history.recent()[0].label,'999');assert(JSON.stringify(history.recent()).length<10000);
});
test('activity enforces total serialized bytes and safely summarizes cyclic data',()=>{
 const history=new ActivityHistory(100,1024),cycle:any={};cycle.self=cycle;history.add({label:'cycle',result:'error',details:cycle});assert.equal(history.size,1);
 for(let i=0;i<100;i++)history.add({label:'é'.repeat(200),result:'ok',details:{data:'x'.repeat(500)}});assert(new TextEncoder().encode(JSON.stringify(history.recent())).byteLength<=1024);
});
