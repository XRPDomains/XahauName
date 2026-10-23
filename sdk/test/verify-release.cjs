// Read-only verification and simulations. No wallet, seed or submission APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {XahauNameClient, TESTNET, parameters} = require('../dist');
const repo = path.resolve(__dirname, '../..');
const manifest = require('../../deployments/testnet.json');
const validation = require('../../deployments/testnet-validation.json');
const checks = [];
async function main() {
  const c = new XahauNameClient(TESTNET);
  try {
    await c.connect();
    for (const label of ['bad_name_long', 'bad\u00e9longrelease']) {
      const tx = await c.rawClient.autofill({TransactionType: 'Payment', Account: validation.ownerA,
        Destination: TESTNET.treasury, Amount: '10000000', NetworkID: 21338,
        HookParameters: parameters('buy', {label: Buffer.from(label), tld: Buffer.from('xah')})});
      const r = (await c.rawClient.simulate({...tx, SigningPubKey: ''})).result;
      assert.equal(r.engine_result ?? r.meta?.TransactionResult, 'tecHOOK_REJECTED');
      assert(r.meta.HookExecutions.some(e => BigInt('0x' + e.HookExecution.HookReturnCode) === 10n));
      checks.push({name: 'raw noncanonical issuance ' + Buffer.from(label).toString('hex'), result: 'PASS'});
    }
    const tx = await c.rawClient.autofill({TransactionType: 'Invoke', Account: TESTNET.treasury,
      NetworkID: 21338, HookParameters: parameters('unpause')});
    const simulation = (await c.rawClient.simulate({...tx, SigningPubKey: ''})).result;
    assert.equal(simulation.engine_result ?? simulation.meta?.TransactionResult, 'tesSUCCESS');
    checks.push({name: 'unpause simulation is idempotent', result: 'PASS'});
    for (const domain of validation.domains) assert.equal(await c.describe(domain), null);
    checks.push({name: 'test domains removed', result: 'PASS'});
    const objects = (await c.rawClient.request({command: 'account_objects', account: TESTNET.treasury,
      type: 'hook', ledger_index: 'validated'})).result.account_objects.flatMap(o => o.Hooks ?? []);
    for (const h of manifest.handlers) {
      const definition = (await c.rawClient.request({command: 'ledger_entry', index: h.definitionIndex,
        ledger_index: 'validated'})).result.node;
      const installed = objects[h.position].Hook;
      assert.equal(installed.HookHash, h.hash);
      assert.equal(installed.HookOn ?? definition.HookOn, h.hookOn);
      assert.equal(installed.HookCanEmit ?? definition.HookCanEmit, h.hookCanEmit);
    }
    checks.push({name: 'installed hashes and effective masks match manifest', result: 'PASS'});
    if (process.env.VERIFY_BASELINE) {
      const before = JSON.parse(fs.readFileSync(process.env.VERIFY_BASELINE, 'utf8'));
      const entries = []; let marker;
      do {
        const r = (await c.rawClient.request({command: 'account_namespace', account: TESTNET.treasury,
          namespace_id: TESTNET.namespaceId, ledger_index: 'validated', ...(marker ? {marker} : {})})).result;
        entries.push(...r.namespace_entries.map(e => ({key: e.HookStateKey, value: e.HookStateData})));
        marker = r.marker;
      } while (marker);
      entries.sort((a, b) => a.key.localeCompare(b.key));
      assert.deepEqual(entries, before);
      checks.push({name: 'namespace exactly restored after live tests', result: 'PASS', entries: entries.length});
    }
    const out = path.join(repo, 'hook/build/current'); fs.mkdirSync(out, {recursive: true});
    const result = {result: 'PASS', installTransaction: manifest.installTransaction, checks};
    fs.writeFileSync(path.join(out, 'post-release.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await c.disconnect(); }
}
main().catch(e => {console.error(e.message); process.exitCode = 1;});
