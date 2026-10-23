import test from 'node:test';
import assert from 'node:assert/strict';
import {explainError} from '../../packages/sdk/src/diagnostics';
test('Wallet Kit rejection and network codes are mapped without relying on provider-specific message text',()=>{
 for(const code of ['SIGN_REJECTED','CONNECTION_REJECTED']){const result=explainError({code});assert.equal(result.stage,'wallet');assert.equal(result.title,'Wallet request declined');}
 for(const code of ['NETWORK_MISMATCH','NETWORK_NOT_SUPPORTED']){const result=explainError({code});assert.equal(result.stage,'wallet');assert.equal(result.title,'Check your wallet');}
});
test('wallet expiry verification failure is reported at the wallet stage',()=>{
 const info=explainError({code:'SIGN_FAILED',message:'Xahau verification failed: Signed fields changed: LastLedgerSequence'});
 assert.equal(info.stage,'wallet');assert.equal(info.title,'Wallet changed the transaction expiry');assert.equal(info.recovery,'check-status');assert.match(info.message,/Refresh the domain status/);
});
test('wallet verification failure keeps unknown submission outcomes and provider hashes',()=>{
 const hash='AB'.repeat(32),info=explainError({code:'SIGN_FAILED',message:'Xahau verification failed: Signed fields changed: LastLedgerSequence',details:{providerHash:hash,outcomeUnknown:true}});
 assert.equal(info.txHash,hash);assert.equal(info.stage,'wallet');assert.equal(info.recovery,'check-status');assert.match(info.message,/Do not send another purchase payment/);
 assert.equal(explainError({code:'SIGN_FAILED',message:'other verification failure'}).title,'Wallet verification failed');
});
test('reported five-second connection timeout is classified as connection failure',()=>{
    const result=explainError(new Error("Error: connect() timed out after 5000 ms. If your internet connection is working, the xahaud server may be blocked or inaccessible."));
    assert.equal(result.title,'Unable to connect to Xahau');assert.equal(result.stage,'connection');assert.equal(result.recovery,'reconnect');assert.match(result.message,/try again/);assert.doesNotMatch(result.message,/Open Activity|payment|operator/);
});
test('structured connection failures and raw disconnect errors offer reconnection',()=>{
    for(const error of [{code:'RPC_CONNECTION_FAILED'}, {name:'ConnectionError'}, {name:'DisconnectedError'}, {name:'NotConnectedError'}]){
        const result=explainError(error);assert.equal(result.stage,'connection');assert.equal(result.recovery,'reconnect');assert.equal(result.message,'Could not load on-chain data. Please try again.');
    }
});
test('connection failure after submission retains confirmation uncertainty and transaction hash',()=>{
    const hash='AB'.repeat(32),result=explainError({code:'RPC_CONNECTION_FAILED',details:{txHash:hash}});
    assert.equal(result.stage,'confirmation');assert.equal(result.recovery,'check-status');assert.equal(result.txHash,hash);assert.match(result.message,/Do not send another purchase payment/);
});
test('ledger-not-connected UNKNOWN_ERROR is a brief connection error unless submission is uncertain',()=>{
 const error={code:'UNKNOWN_ERROR',message:'You need to be connected to a ledger'};
 const info=explainError(error);assert.equal(info.stage,'connection');assert.equal(info.recovery,'reconnect');assert.doesNotMatch(info.message,/payment|Activity/);
 const hash='AB'.repeat(32),submitted=explainError({...error,txHash:hash});assert.equal(submitted.txHash,hash);assert.equal(submitted.stage,'confirmation');
 assert.equal(explainError({...error,details:{outcomeUnknown:true}}).stage,'confirmation');
});
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

for(const code of ['actNotFound','tecUNFUNDED_PAYMENT','WRONG_NETWORK','NOT_CONNECTED','NO_SIGNER'])test('diagnostics respect configured network for '+code,()=>{const r=explainError({code});assert.doesNotMatch(r.message,/testnet|test XAH|faucet/i);assert.match(r.message,/network/);});
