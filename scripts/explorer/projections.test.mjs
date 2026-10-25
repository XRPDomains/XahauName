import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {generate,layout} from './projections.mjs';
import {root,verifyToolchain} from './toolchain.mjs';
import {validateSnapshot,deploymentConfig} from './snapshot.mjs';
const require=createRequire(import.meta.url),sdk=require(path.join(root,'packages/sdk/dist')),{decodeAccountID}=require('xahau');
const {parser:makeParser}=await import(pathToFileURL(path.join(verifyToolchain(),'scripts/lib/io.js')));
const {normalise,lint}=await import(pathToFileURL(path.join(verifyToolchain(),'scripts/lib/manifest.js')));
const {util}=sdk,{config,manifest}=deploymentConfig('testnet'),name='abi-check.xah',label='abi-check',owner=manifest.treasury;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'explorer/catalog.json')));
function fixture(){
 const entries=[],put=(key,value)=>entries.push({key,value:Buffer.isBuffer(value)?value.toString('hex').toUpperCase():value});
 const id='AB'.repeat(32),rootBytes=Buffer.alloc(32);Buffer.from(decodeAccountID(owner)).copy(rootBytes);rootBytes[20]=1;rootBytes.writeBigUInt64BE(800000001n,21);
 put(util.rootKey(label,'xah'),rootBytes);put(util.tokenKey(label,'xah'),id);put(util.labelOfKey(id),Buffer.from(name));put(util.uriKey(id),Buffer.from(name));put(util.primaryOfKey(owner),Buffer.from(util.rootKey(label,'xah'),'hex'));
 const idx=Buffer.alloc(124);idx[0]=1;idx.writeUInt16BE(1,1);idx[3]=2;idx.writeUInt16BE(21337,4);idx[34]=1;idx[40]=255;idx[41]=0;
 put(util.recordsKey(label,'xah'),idx);put(util.addrKey(label,'xah',21337),Buffer.from(decodeAccountID(owner)));put(util.textKey(label,'xah','description'),Buffer.from('Profile'));
 const custom=util.textKey(label,'xah','custom.key');put(util.textSlotKey(label,'xah',0),Buffer.concat([Buffer.from(custom,'hex'),Buffer.from('custom.key')]));put(custom,Buffer.from('Custom'));
 return {schemaVersion:1,network:'testnet',networkId:config.expectedNetworkId,treasury:owner,namespace:config.namespaceId,accountNamespaces:[config.namespaceId],ledgerHash:'CD'.repeat(32),ledgerIndex:123,hooks:manifest.handlers.map(h=>({name:h.name,hash:h.hash,namespace:config.namespaceId})),hookHashes:config.hookHashes,entries};
}
test('all source record kinds have exercised projections with exactly one match across ten manifests',async()=>{
 const snapshot=fixture(),result=await generate(snapshot,catalog),parser=makeParser(),all=Object.entries(result.projections).flatMap(([owner,projections])=>projections.map(p=>({owner,p}))),used=new Set();
 for(const row of [...snapshot.entries.map(e=>({k:e.key,v:e.value})),...result.extra]){
  const matches=all.filter(({p})=>parser.decodeHookState(row.k,row.v,p));assert.equal(matches.length,1,row.k);used.add(matches[0]);
 }
 assert.equal(used.size,all.length);assert.deepEqual(Object.keys(result.counts).sort(),Object.keys(layout.abiOwners).sort());assert.equal(Object.keys(result.projections).length,10);
 for(const projections of Object.values(result.projections)){const normalized=normalise(projections);assert.deepEqual(lint(normalized.manifest),{errors:[],warnings:[]});}
});
test('root owner and eight-byte ledger time decode correctly; pending amount and flags preserve BE bytes',async()=>{
 const result=await generate(fixture(),catalog),parser=makeParser(),all=Object.values(result.projections).flat();
 const projection=all.find(p=>p.selector[0].pattern===util.rootKey(label,'xah')),data=fixture().entries.find(e=>e.key===util.rootKey(label,'xah')).value;
 const decoded=parser.decodeHookState(util.rootKey(label,'xah'),data,projection);assert.equal(decoded.HookStateData[0].value,owner);assert.equal(decoded.HookStateData[2].value,'800000001');
 const pending=result.extra.find(e=>e.note.includes('pending')),p=all.find(p=>p.selector[0].pattern===pending.k),value=parser.decodeHookState(pending.k,pending.v,p);
 assert.equal(value.HookStateData[1].value,'123456789');assert.equal(value.HookStateData[2].value,2147483648);
});
test('unknown hash keys fail closed even when their value looks exactly like a valid root',async()=>{
 const snapshot=fixture();snapshot.entries.push({key:'FE'.repeat(32),value:snapshot.entries[0].value});await assert.rejects(generate(snapshot,catalog),/Undecoded state keys/);
});
test('legacy unnamed descriptors retain their actual hash mapping without inventing a custom key name',async()=>{
 const snapshot=fixture(),slot=snapshot.entries.find(e=>e.key===util.textSlotKey(label,'xah',0));slot.value=slot.value.slice(0,64);
 const result=await generate(snapshot,catalog),projection=result.projections['set-text'].find(p=>p.selector[0].pattern===slot.key);assert.equal(projection.data.length,1);assert.equal(projection.data[0].type,'Hash256');
});
test('changed descriptor length needs regeneration; old exact-selector ABI does not falsely claim coverage',async()=>{
 const snapshot=fixture(),before=await generate(snapshot,catalog),key=util.addrKey(label,'xah',21337),address=snapshot.entries.find(e=>e.key===key),old=before.projections['set-address'].find(p=>p.selector[0].pattern===key);
 address.value='00'+address.value;assert.equal(makeParser().decodeHookState(key,address.value,old),undefined);
 const next=await generate(snapshot,catalog),current=next.projections['set-address'].find(p=>p.selector[0].pattern===key);assert(makeParser().decodeHookState(key,address.value,current));
});
test('snapshot rejects another network, deployment or effective namespace',()=>{
 const snapshot=fixture();assert.equal(validateSnapshot(snapshot,'testnet',config),snapshot);
 for(const patch of [{networkId:21337},{ledgerHash:'bad'},{treasury:'other'},{hooks:snapshot.hooks.map(h=>({...h,namespace:'AA'.repeat(32)}))},{hookHashes:{}}])assert.throws(()=>validateSnapshot({...snapshot,...patch},'testnet',config),/mismatch/);
});
test('testnet catalog preimages agree with the three provenance-backed TLD tombstones',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'explorer/catalog.testnet.json')));
 for(const evidence of catalog.evidence){assert.equal(util.tldKey(evidence.tld),evidence.stateKey);assert(catalog.tlds.includes(evidence.tld));assert.match(evidence.transaction,/^[A-F0-9]{64}$/);assert.equal(evidence.operation,'removeTld');}
});
