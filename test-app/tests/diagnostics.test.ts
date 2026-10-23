import test from 'node:test';
import assert from 'node:assert/strict';
import {explainError} from '../../sdk/src/diagnostics';
for (const code of ['tecUNFUNDED_PAYMENT','tecINSUFFICIENT_RESERVE','terINSUF_FEE_B','tecINSUFF_FEE']) {
    test('friendly available-XAH explanation for '+code,()=>{
        const result=explainError({code,message:'technical failure'});
        assert.equal(result.stage,'ledger');assert.match(result.message,/reserve/);
        assert(!result.handler);assert.equal(result.code,code);
    });
}
test('underpayment is different from insufficient wallet balance',()=>{
    const r=explainError({code:50});assert.match(r.message,/price check/);assert(!r.title.includes('available XAH'));
});
for(const [message,stage]of [['emit fail','mint'],['offer emit failed','offer'],['refund emit failed','refund']]as const){
    test('emission stage diagnostics '+stage,()=>{
        const r=explainError({code:60,details:{txHash:'AB'.repeat(32),failure:{handler:'issuance',hookHash:'CD'.repeat(32),returnString:message}}});
        assert.equal(r.stage,stage);assert.equal(r.handler,'issuance');assert.equal(r.txHash,'AB'.repeat(32));assert.match(r.message,/Do not pay again/);
    });
}
test('confirmation uncertainty retains its hash and never advises payment retry',()=>{
    const r=explainError({code:'NOT_VALIDATED',details:{txHash:'AB'.repeat(32)}});
    assert.equal(r.recovery,'check-status');assert.equal(r.txHash,'AB'.repeat(32));assert.match(r.message,/do not send another purchase/);
});
test('actual failing hook is preserved without exposing raw hook strings to user',()=>{
    const r=explainError({code:12,message:'Hook returned RC_NOT_OWNER',details:{failure:{handler:'authorization',hookHash:'AB'.repeat(32)}}});
    assert.equal(r.handler,'authorization');assert.match(r.message,/does not own/);assert(!r.message.includes('RC_'));
});
test('wallet rejection and wrong network are actionable',()=>{
    assert.equal(explainError({code:4001}).stage,'wallet');
    assert.equal(explainError({code:'WRONG_NETWORK'}).stage,'wallet');
    assert.match(explainError({code:4001}).message,/Claim domain later/);
});
test('local form messages remain readable and unknown errors preserve uncertainty',()=>{
    assert.match(explainError(new Error('The confirmation name does not match.')).message,/does not match/);
    assert.equal(explainError(new Error('socket disappeared')).recovery,'check-status');
    assert(!explainError(new Error('socket disappeared')).message.includes('socket'));
});
test('weak-phase failure does not pretend the successful native transaction rolled back',()=>{
    const r=explainError({code:20,details:{validated:true,engineResult:'tesSUCCESS',txHash:'AB'.repeat(32),failure:{handler:'claim'}}});
    assert.equal(r.stage,'claim');assert.equal(r.recovery,'operator');assert.match(r.message,/transaction is confirmed/);assert(!r.message.includes('rolled back'));
});
test('post-claim consistency failure preserves the submitted transaction hash',()=>{
    const r=explainError({code:'CLAIM_NOT_FINALIZED',details:{tx:{txHash:'AB'.repeat(32),engineResult:'tesSUCCESS'}}});
    assert.equal(r.txHash,'AB'.repeat(32));assert.equal(r.recovery,'operator');
});
test('raw RPC unfunded-account error is readable',()=>{
    assert.equal(explainError({data:{error:'actNotFound'}}).title,'Wallet is not funded');
});
test('refund pending is separated from operator recovery',()=>{
    const r=explainError({code:'REGISTRATION_FAILED',details:{stage:'refundPending'}});
    assert.equal(r.stage,'refund');assert.equal(r.recovery,'check-status');assert.match(r.message,/do not send another/);
});
test('registration recovery never suggests buying again',()=>{
    const r=explainError({code:'REGISTRATION_FAILED',details:{stage:'recoveryRequired'}});
    assert.equal(r.recovery,'operator');assert.match(r.message,/Do not pay again/);
});
