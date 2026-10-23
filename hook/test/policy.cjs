const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../build/current'),parts=require('../config/handlers.json'),sha=s=>crypto.createHash('sha512').update(s).digest().subarray(0,32),owner=Buffer.alloc(20,0x22),id=sha('native domain'),rk=sha('alice.xah:root').toString('hex'),results=[];
function fresh(){const rv=Buffer.alloc(32);owner.copy(rv);return new Map([[rk,rv],[sha('alice.xah:token').toString('hex'),id],[Buffer.concat([Buffer.from('lof:'),id.subarray(0,28)]).toString('hex'),Buffer.from('alice.xah')]]);}
function run(values,op,data={},options={}){const original=new Map([...values].map(([k,v])=>[k,Buffer.from(v)]));const params=new Map([['xn_v',Buffer.from([2])],['op',Buffer.from([op])],['label',Buffer.from('alice')],['tld',Buffer.from('xah')],...Object.entries(data).map(([k,v])=>[k,Buffer.from(v)])]);let r;for(const part of parts){const t=require(path.join(root,part,'runtime.cjs')).setup({values,params,fields:options.fields??new Map([[524289,owner]]),txType:99,enforceGuards:true,...options});r=t.invoke('hook',0);if(r.kind==='rollback'||r.kind==='guard'){values.clear();for(const[k,v]of original)values.set(k,v);break;}}return r;}
function probe(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
probe('raw lock opcode is disabled on-chain',()=>{const v=fresh(),before=JSON.stringify([...v]),r=run(v,8);assert.equal(r.kind,'rollback');assert.equal(r.code,4);assert.equal(JSON.stringify([...v]),before);});
probe('native-owner mismatch rolls back an earlier address-handler write',()=>{const v=fresh(),before=JSON.stringify([...v]),r=run(v,4,{coinType:Buffer.from([0,0,83,89]),addr:'00'+'22'.repeat(20)},{nativeOwner:Buffer.alloc(20,0x44)});assert.equal(r.kind,'rollback');assert.equal(r.code,12);assert.equal(JSON.stringify([...v]),before);});
probe('clear address state failure is checked',()=>{const v=fresh(),r=run(v,5,{coinType:Buffer.from([0,0,0,144])},{failWritePredicate:(n,k)=>n===0&&k===sha('alice.xah:addr:144').toString('hex')});assert.equal(r.kind,'rollback');assert.equal(r.code,20);});
for(const prefix of [Buffer.alloc(0),Buffer.from([32])])probe('domain Remit is rejected with '+(prefix.length?'VL':'raw')+' vector',()=>{const v=fresh(),r=run(v,0,{},{txType:95,fields:new Map([[524289,owner],[1245283,Buffer.concat([prefix,id])]])});assert.equal(r.kind,'rollback');assert.equal(r.code,65);assert(v.get(rk).subarray(0,20).equals(owner));});
probe('unrelated token Remit is accepted without domain changes',()=>{const v=fresh(),before=JSON.stringify([...v]),r=run(v,0,{},{txType:95,fields:new Map([[1245283,Buffer.alloc(32,0x99)]])});assert.equal(r.kind,'accept');assert.equal(r.code,0);assert.equal(JSON.stringify([...v]),before);});
probe('maximum Remit token vector respects guards',()=>{const v=fresh(),ids=Buffer.alloc(1024,0x99);id.copy(ids,31*32);const r=run(v,0,{},{txType:95,fields:new Map([[1245283,ids]])});assert.equal(r.code,65);});
for(const label of ['bad_name','_bad','bad_',Buffer.from([0xc3,0xa9])])probe('raw issuance rejects noncanonical label '+Buffer.from(label).toString('hex'),()=>{
 const amount=Buffer.alloc(8);amount.writeBigUInt64BE(0x400000000000000cn);
 const r=run(fresh(),1,{label},{txType:0,fields:new Map([[524289,Buffer.alloc(20,0x11)],[393217,amount]])});
 assert.equal(r.kind,'rollback');assert.equal(r.code,10);
});
probe('unpause state deletion failure rejects instead of reporting success',()=>{
 const key=sha('_paused').toString('hex'),v=fresh();v.set(key,Buffer.from([1]));
 const r=run(v,14,{},{fields:new Map([[524289,Buffer.alloc(20,0x11)]]),failWritePredicate:(n,k)=>n===0&&k===key});
 assert.equal(r.kind,'rollback');assert.equal(r.code,20);assert.equal(v.get(key)[0],1);
});
fs.writeFileSync(path.join(root,'policy-results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,failures:results.filter(r=>!r.pass)}));if(results.some(r=>!r.pass))process.exitCode=1;
