import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchMetadata} from '../../packages/sdk/src/metadata';
test('metadata proxy transport shares concurrent and repeated reads but isolates another transport',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return new Response(JSON.stringify({image:'https://example.com/image.png'}));};
 const url='https://example.com/shared-metadata';
 const [a,b]=await Promise.all([fetchMetadata(url,{fetch:transport}),fetchMetadata(url,{fetch:transport})]);
 assert.equal(calls,1);assert.deepEqual(a,b);await fetchMetadata(url,{fetch:transport});assert.equal(calls,1);
 const other:typeof fetch=async()=>new Response(JSON.stringify({image:'https://example.com/other.png'}));
 assert.equal((await fetchMetadata(url,{fetch:other}))?.image,'https://example.com/other.png');
});
test('failed metadata is deduplicated briefly and retried rather than cached for five minutes',async()=>{
 const now=Date.now;let time=now(),calls=0;Date.now=()=>time;
 const transport:typeof fetch=async()=>{if(++calls===1)throw Error('temporary failure');return new Response(JSON.stringify({image:'https://example.com/recovered.png'}));};
 try{
  const url='https://example.com/recovering-metadata';assert.equal(await fetchMetadata(url,{fetch:transport}),null);assert.equal(await fetchMetadata(url,{fetch:transport}),null);assert.equal(calls,1);
  time+=5001;assert.equal((await fetchMetadata(url,{fetch:transport}))?.image,'https://example.com/recovered.png');assert.equal(calls,2);
 }finally{Date.now=now;}
});
