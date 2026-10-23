// Read-only subscription/history coverage check. No signer or write requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {decodeAccountID} = require('xahau');
const {XahauNameClient, TESTNET} = require('../dist');
const validation = require('../../deployments/testnet-validation.json');
const repo = path.resolve(__dirname, '../..');
async function main() {
    const c = new XahauNameClient(TESTNET); let timer;
    try {
        await c.connect();
        const nextLedger = new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('No validated ledger notification within 30 seconds')), 30000);
            c.rawClient.once('ledgerClosed', value => {clearTimeout(timer); resolve(value);});
        });
        const subscription = (await c.rawClient.request({command: 'subscribe', accounts: [TESTNET.treasury], streams: ['ledger']})).result;
        const ledger = await nextLedger;
        const selected = validation.transactionsByAction.filter(t =>
            ['purchase domain through SDK', 'claim purchased domain', 'save all ten Global Keys with one Invoke', 'create transfer offer', 'recipient claims transfer', 'burn domain', 'cleanup second domain'].includes(t.action));
        const receipts = [];
        for (const t of selected) receipts.push({action: t.action, receipt: (await c.rawClient.request({command: 'tx', transaction: t.hash, binary: false})).result});
        const min = Math.min(...receipts.map(t => t.receipt.ledger_index)), max = Math.max(...receipts.map(t => t.receipt.ledger_index));
        const found = new Set(), emitted = []; let marker;
        do {
            const r = (await c.rawClient.request({command: 'account_tx', account: TESTNET.treasury,
                ledger_index_min: min, ledger_index_max: max, forward: true, limit: 200, ...(marker ? {marker} : {})})).result;
            for (const row of r.transactions) {
                const tx = row.tx ?? row.tx_json, hash = tx?.hash ?? row.hash;
                found.add(hash);
                if (tx?.EmitDetails && tx.Account === TESTNET.treasury) emitted.push({hash, type: tx.TransactionType,
                    parent: tx.EmitDetails.EmitParentTxnID, result: row.meta?.TransactionResult,
                    hookExecutions: row.meta?.HookExecutions?.length ?? 0});
            }
            marker = r.marker;
        } while (marker);
        let namespaceNodes = 0;
        for (const {receipt} of receipts) for (const row of receipt.meta.AffectedNodes) {
            const node = row.CreatedNode ?? row.ModifiedNode ?? row.DeletedNode;
            if (node.LedgerEntryType !== 'HookState') continue;
            const fields = node.NewFields ?? node.FinalFields;
            // Upstream keylet::hookState: prefix 0x0076, AccountID, state key, namespace.
            const index = crypto.createHash('sha512').update(Buffer.concat([Buffer.from([0, 118]),
                Buffer.from(decodeAccountID(TESTNET.treasury)), Buffer.from(fields.HookStateKey, 'hex'),
                Buffer.from(TESTNET.namespaceId, 'hex')])).digest().subarray(0, 32).toString('hex').toUpperCase();
            assert.equal(index, node.LedgerIndex, 'HookState does not belong to the configured account/namespace');
            namespaceNodes++;
        }
        const coverage = receipts.map(({action, receipt}) => ({action, hash: receipt.hash, ledger: receipt.ledger_index,
            inTreasuryHistory: found.has(receipt.hash), hookExecutions: receipt.meta.HookExecutions?.length ?? 0,
            hookStateNodes: receipt.meta.AffectedNodes.filter(n => (n.CreatedNode ?? n.ModifiedNode ?? n.DeletedNode).LedgerEntryType === 'HookState').length}));
        const result = {networkID: 21338, subscriptionAccepted: Boolean(subscription), ledgerNotification: ledger.ledger_index,
            historyRange: [min, max], coverage, emitted, namespaceNodesVerified: namespaceNodes,
            treasuryHistoryCompleteForSample: coverage.every(row => row.inTreasuryHistory),
            limitation: 'Account-history coverage is sampled, not a proof that an account-only feed captures every future lifecycle or callback.'};
        const out = path.join(repo, 'hook/build/current/review'); fs.mkdirSync(out, {recursive: true});
        fs.writeFileSync(path.join(out, 'websocket-proof.json'), JSON.stringify(result, null, 2) + '\n');
        assert.equal(result.subscriptionAccepted, true);
        console.log(JSON.stringify(result));
    } finally {clearTimeout(timer); await c.disconnect();}
}
main().catch(e => {console.error(e.message); process.exitCode = 1;});
