const test=require('node:test'),assert=require('node:assert/strict');
const {RegistrarModule,util}=require('../dist');
const {readRefundStatus}=require('../dist/refund-read');
const {decodeAccountID}=require('xahau');
const treasury='rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs',buyer='rKMpMYo7yo7Xa4Bqmuf4BQRoeaf9TwkmDZ';
const domain='refund.xah',id=util.computeUritokenId(treasury,'refund','xah'),hash='AA'.repeat(32),ledger='BB'.repeat(32);
function fixture(){
 const status={domain,uritokenId:id,stage:'refundPending',ledgerHash:ledger,refundTxHash:hash,recipient:buyer,amountDrops:1000000n};
 const receipt={hash,validated:true,ledger_index:90,TransactionType:'Payment',Account:treasury,Destination:buyer,InvoiceID:id,
  Amount:'1000000',Sequence:0,EmitDetails:{EmitGeneration:2},meta:{TransactionResult:'tecDST_TAG_NEEDED'}};
 const calls=[],ctx={treasury,request:async q=>{calls.push(q);return q.command==='tx'?receipt:{validated:true,ledger_hash:ledger,ledger:{ledger_index:'100'}};}};
 return{status,receipt,calls,ctx};
}
test('explicit refund read reports validated failure, while paid-but-tracked needs settlement',async()=>{
 const f=fixture(),registrar=new RegistrarModule(f.ctx);
 registrar.getRegistrationStatus=async(name,options)=>{assert.equal(name,domain);assert.equal(options.ledgerHash,ledger);return f.status;};
 const failed=await registrar.getRefundStatus(domain,{ledgerHash:ledger});
 assert.equal(failed.state,'failed');assert.equal(failed.engineResult,'tecDST_TAG_NEEDED');assert.equal(failed.recovery,'operator');assert.equal(failed.transactionHash,hash);
 f.receipt.meta.TransactionResult='tesSUCCESS';const paid=await readRefundStatus(f.ctx,f.status);assert.equal(paid.state,'paid');assert.equal(paid.recovery,'operator');
 assert.deepEqual(f.calls.map(x=>x.command),['tx','ledger','tx','ledger']);assert(f.calls.filter(x=>x.command==='ledger').every(x=>x.ledger_hash===ledger));
});
test('untracked and incomplete refund tracking do not fetch receipts or imply payment',async()=>{
 const f=fixture();delete f.status.refundTxHash;assert.equal((await readRefundStatus(f.ctx,f.status)).state,'notTracked');
 f.status.refundTxHash=hash;delete f.status.recipient;const result=await readRefundStatus(f.ctx,f.status);assert.equal(result.state,'unknown');assert.equal(result.reason,'missingPending');assert.equal(result.recovery,'operator');assert.equal(f.calls.length,0);
});
test('missing, unvalidated and later-than-snapshot receipts remain unresolved',async()=>{
 const f=fixture();f.ctx.request=async()=>{throw {data:{error:'txnNotFound'}};};assert.equal((await readRefundStatus(f.ctx,f.status)).reason,'receiptUnavailable');
 const g=fixture();delete g.receipt.validated;assert.equal((await readRefundStatus(g.ctx,g.status)).state,'unvalidated');assert.equal(g.calls.length,1);
 const h=fixture();h.receipt.ledger_index=101;const result=await readRefundStatus(h.ctx,h.status);assert.equal(result.state,'unknown');assert.equal(result.reason,'afterSnapshot');assert.equal(result.engineResult,undefined);
});
test('receipt identity, amount, emission and metadata mismatches never become paid',async()=>{
 const changes=[{hash:'CC'.repeat(32)},{Account:buyer},{Destination:treasury},{InvoiceID:'CC'.repeat(32)},{Amount:'999999'},
  {Amount:{currency:'USD',value:'1',issuer:buyer}},{Sequence:1},{EmitDetails:null},{TransactionType:'Invoke'},
  {ledger_index:0},{ledger_index:'90'},{Flags:0x20000},{meta:{}},{meta:{TransactionResult:'terQUEUED'}}];
 for(const change of changes){const f=fixture();Object.assign(f.receipt,change);await assert.rejects(readRefundStatus(f.ctx,f.status),e=>e.code==='BAD_RPC_RESPONSE');}
});
test('different/unvalidated snapshot headers and RPC transport errors are not hidden',async()=>{
 for(const body of [null,[],42]){
  const f=fixture();f.ctx.request=async()=>body;await assert.rejects(readRefundStatus(f.ctx,f.status),e=>e.code==='BAD_RPC_RESPONSE');
  const g=fixture(),request=g.ctx.request;g.ctx.request=async q=>q.command==='tx'?request(q):body;await assert.rejects(readRefundStatus(g.ctx,g.status),e=>e.code==='BAD_RPC_RESPONSE');
 }
 for(const change of [{validated:false},{ledger_hash:'CC'.repeat(32)},{ledger:{ledger_index:'bad'}}]){
  const f=fixture(),request=f.ctx.request;f.ctx.request=async q=>q.command==='tx'?request(q):{validated:true,ledger_hash:ledger,ledger:{ledger_index:'100'},...change};
  await assert.rejects(readRefundStatus(f.ctx,f.status),e=>e.code==='BAD_RPC_RESPONSE');
 }
 const f=fixture(),error=new Error('Connection timed out');f.ctx.request=async()=>{throw error;};await assert.rejects(readRefundStatus(f.ctx,f.status),e=>e===error);
});
test('v2 tx_json receipt format is supported',async()=>{
 const f=fixture(),{hash,validated,ledger_index,meta,...tx_json}=f.receipt;
 f.ctx.request=async q=>q.command==='tx'?{hash,validated,ledger_index,meta,tx_json}:{validated:true,ledger_hash:ledger,ledger:{ledger_index:100}};
 assert.equal((await readRefundStatus(f.ctx,f.status)).state,'failed');
});
test('registration exposes refund hash without adding receipt/history RPC and rejects corrupt hashes',async()=>{
 const pending=Buffer.alloc(32);Buffer.from(decodeAccountID(buyer)).copy(pending);pending.writeBigUInt64BE(1000000n,20);
 const values=new Map([[util.pendingKey(id),pending],[util.asyncKey('rfd',id),Buffer.from(hash,'hex')]]);
 let requests=0;const ctx={treasury,readState:async k=>values.get(k)??null,ledgerHash:async()=>ledger,ledgerObject:async()=>null,request:async()=>{requests++;throw Error('Unexpected receipt RPC');}};
 const r=new RegistrarModule(ctx),s=await r.getRegistrationStatus(domain);assert.equal(s.refundTxHash,hash);assert.equal(s.stage,'refundPending');assert.equal(requests,0);
 values.set(util.asyncKey('rfd',id),Buffer.alloc(31));await assert.rejects(r.getRegistrationStatus(domain),e=>e.code==='BAD_STATE');
});
