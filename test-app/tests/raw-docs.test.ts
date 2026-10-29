import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeAccountID,encode,decode} from 'xahau';
import {domainKeys,hashHalf,verifyEvidence} from '../../docs/examples/verify-domain.mjs';

const treasury='rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs',owner='rBnDiXzfeeXoujn38nSWHsYnQEaHyX8Ds';
test('published raw Invoke bytes round-trip through the generic Xahau codec',()=>{
 const source=readFileSync(new URL('../../docs/site/hook.md',import.meta.url),'utf8');
 const json=source.match(/```json\n([\s\S]*?)\n```/)![1],tx=JSON.parse(json);
 const decoded=decode(encode({...tx,Account:owner,Destination:treasury,Sequence:1,Fee:'10',LastLedgerSequence:1}));
 assert.equal(decoded.TransactionType,'Invoke');assert.equal(decoded.NetworkID,21338);
 const values=Object.fromEntries((decoded.HookParameters as any[]).map(item=>[Buffer.from(item.HookParameter.HookParameterName,'hex').toString(),item.HookParameter.HookParameterValue]));
 assert.equal(values.xn_v,'02');assert.equal(values.op,'06');
 assert.equal(Buffer.from(values.label,'hex').toString(),'alice');assert.equal(Buffer.from(values.tld,'hex').toString(),'xah');
 assert.equal(Buffer.from(values.key,'hex').toString(),'description');assert.equal(Buffer.from(values.value,'hex').toString(),'Hello');
 const schema=JSON.parse(readFileSync(new URL('../../protocol/schema.json',import.meta.url),'utf8'));
 assert.equal(parseInt(values.op,16),schema.operations.setText);
 const header=Buffer.from('0200020040','hex');assert.equal(schema.profileKeys[1],'description');assert.equal(schema.profileKeys[6],'notice');
 assert.equal(header.readUInt16BE(1),1<<1);assert.equal(header.readUInt16BE(3),1<<6);
});
test('independent reader rejects stale ownership and forged identity without SDK helpers',()=>{
 const domain='alice.xah',uri=Buffer.from('https://example.com/metadata/alice.xah');
 const tokenId=hashHalf(Buffer.concat([Buffer.from([0,0x55]),Buffer.from(decodeAccountID(treasury)),uri])).toString('hex').toUpperCase();
 const root=Buffer.alloc(32);root.set(decodeAccountID(owner));root[20]=1;root.writeBigUInt64BE(100n,21);
 const evidence={domain,treasury,root,tokenId,token:{LedgerEntryType:'URIToken',Owner:owner,Issuer:treasury,index:tokenId,URI:uri.toString('hex')},reverse:domain};
 assert.equal(verifyEvidence(evidence).owner,owner);assert.equal(verifyEvidence(evidence).primary,true);
 assert.throws(()=>verifyEvidence({...evidence,root:root.subarray(0,31)}),/32 bytes/);
 assert.throws(()=>verifyEvidence({...evidence,token:{...evidence.token,Owner:treasury}}),/owner differ/);
 assert.throws(()=>verifyEvidence({...evidence,token:{...evidence.token,Issuer:owner}}),/identity mismatch/);
 assert.throws(()=>verifyEvidence({...evidence,token:{...evidence.token,URI:Buffer.from('different').toString('hex')}}),/mapping mismatch/);
 assert.throws(()=>verifyEvidence({...evidence,reverse:'other.xah'}),/mapping mismatch/);
 const keys=domainKeys(domain);assert.equal(keys.root.length,64);assert(keys.recovery.startsWith(Buffer.from('rcv:').toString('hex').toUpperCase()));
 assert.throws(()=>domainKeys('Alice.xah'),/canonical/);
});
