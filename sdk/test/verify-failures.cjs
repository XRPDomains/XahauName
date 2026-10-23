// Native-ledger failure simulation only: never signs/submits a transaction.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {XahauNameClient, TESTNET, parameters, explainError} = require('../dist');
const validation = require('../../deployments/testnet-validation.json');
async function main() {
    const c = new XahauNameClient(TESTNET);
    try {
        await c.connect();
        const account = validation.ownerA, label = 'fundcheck' + Date.now();
        const before = (await c.rawClient.request({command: 'account_info', account, ledger_index: 'validated'})).result.account_data;
        const amount = '1000000000000'; assert(BigInt(amount) > BigInt(before.Balance));
        const tx = await c.rawClient.autofill({TransactionType: 'Payment', Account: account, Destination: TESTNET.treasury,
            Amount: amount, NetworkID: 21338, HookParameters: parameters('buy', {label: Buffer.from(label), tld: Buffer.from('xah')})});
        const simulation = (await c.rawClient.simulate({...tx, SigningPubKey: ''})).result;
        const engineResult = simulation.engine_result ?? simulation.meta?.TransactionResult;
        assert.equal(engineResult, 'tecUNFUNDED_PAYMENT');
        const explanation = explainError({code: engineResult}); assert.equal(explanation.stage, 'ledger'); assert(!explanation.handler);
        const after = (await c.rawClient.request({command: 'account_info', account, ledger_index: 'validated'})).result.account_data;
        assert.equal(after.Sequence, before.Sequence); assert.equal(after.Balance, before.Balance);
        assert.equal((await c.registrar.getRegistrationStatus(label + '.xah')).stage, 'available');
        const result = {result: 'PASS', simulated: true, submittedTransactions: 0, engineResult,
            hookExecutions: simulation.meta?.HookExecutions?.length ?? 0, explanation,
            hookStateNodes: (simulation.meta?.AffectedNodes ?? []).filter(row => (row.CreatedNode ?? row.ModifiedNode ?? row.DeletedNode).LedgerEntryType === 'HookState').length,
            unchangedAccountSequenceAndBalance: true, domainRemainsAvailable: true};
        assert.equal(result.hookStateNodes, 0, 'A rejected native payment must not project a successful domain-state update');
        const out = path.resolve(__dirname, '../../hook/build/current/review'); fs.mkdirSync(out, {recursive: true});
        fs.writeFileSync(path.join(out, 'insufficient-funds-simulation.json'), JSON.stringify(simulation, null, 2) + '\n');
        fs.writeFileSync(path.join(out, 'insufficient-funds.json'), JSON.stringify(result, null, 2) + '\n');
        console.log(JSON.stringify(result));
    } finally {await c.disconnect();}
}
main().catch(e => {console.error(e.message); process.exitCode = 1;});
