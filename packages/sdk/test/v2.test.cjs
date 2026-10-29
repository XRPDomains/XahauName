const test = require('node:test'), assert = require('node:assert/strict');
const { Wallet, validate, decodeAccountID } = require('xahau');
const sdk = require('../dist'), { parameters, domainFields, coinBytes, boolBytes, priceBytes, addressBytes, textValueBytes } = sdk;
const { transactionResult, decodeExecutions } = require('../dist/receipts');
const { rootKey, pendingKey, asyncKey, computeUritokenId, primaryOfKey, pricingKey } = sdk.util;
test('buy binds the approved quote and never submits a changed or invalid price',async()=>{
    const s=ctx(),registrar=new sdk.RegistrarModule(s.c);registrar.getPrice=async()=>20n;
    await assert.rejects(registrar.buy({label:'alice',tld:'xah',expectedPriceDrops:10n}),e=>e.code==='PRICE_CHANGED');
    for(const expectedPriceDrops of [-1n,2n**64n,'20'])await assert.rejects(registrar.buy({label:'alice',tld:'xah',expectedPriceDrops}),e=>e.code==='INVALID_ARGUMENT');
    assert.equal(s.sent.length,0);
    await registrar.buy({label:'alice',tld:'xah',expectedPriceDrops:20n});assert.equal(s.sent[0].tx.Amount,'20');
    assert.equal(sdk.explainError({code:'PRICE_CHANGED'}).stage,'validation');
});
const treasury = 'rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs', buyer = 'rKMpMYo7yo7Xa4Bqmuf4BQRoeaf9TwkmDZ', other = 'rU2Wkux7AhyBzw3i4AXunktLAz1j9p8ABF', ledger = 'AB'.repeat(32), namespace = 'CD'.repeat(32), domain = 'alice.xah', id = computeUritokenId(treasury, 'alice', 'xah');
function root(owner = buyer, flags = 0) {
    const b = Buffer.alloc(32);
    Buffer.from(decodeAccountID(owner)).copy(b);
    b[20] = flags;
    b.writeBigUInt64BE(123n, 21);
    return b;
}
function pending(owner = buyer) {
    const b = Buffer.alloc(32);
    Buffer.from(decodeAccountID(owner)).copy(b);
    b.writeBigUInt64BE(10000000n, 20);
    return b;
}
function token(owner = treasury) {
    return {
        LedgerEntryType: 'URIToken', index: id, Owner: owner, Issuer: treasury, URI: Buffer.from(domain).toString('hex'), Amount: '0', Destination: buyer
    };
}
function ctx(signer = buyer) {
    const values = new Map(), tokens = new Map(), sent = [], reads = [];
    const c = {
        treasury, signerAddress: () => signer, readState: async (k, o) => {
            reads.push(o);
            return values.get(k) ?? null;
        }, ledgerHash: async () => ledger, ledgerObject: async (k, o) => {
            assert.equal(o.ledgerHash, ledger);
            return tokens.get(k) ?? null;
        }, request: async () => ({ account_objects: [] }), submit: async (tx, options) => {
            sent.push({ tx, options });
            return {
                txHash: 'AA'.repeat(32), engineResult: 'tesSUCCESS', hookReturnCode: 0, hookReturnString: options.returns[0], status: options.status ?? 'applied', hookExecutions: [], rawMeta: {}
            };
        }
    };
    return {
        c, values, tokens, sent, reads
    };
}
function fields(tx) {
    return Object.fromEntries(tx.HookParameters.map(p => [Buffer.from(p.HookParameter.HookParameterName, 'hex').toString(), Buffer.from(p.HookParameter.HookParameterValue, 'hex')]));
}
function exec(text = 'primary', code = '0', hash = '22'.repeat(32), account = treasury, result = 3) {
    return { HookExecution: {
            HookAccount: account, HookHash: hash, HookResult: result, HookReturnCode: code, HookReturnString: Buffer.from(text + '\0').toString('hex'), Flags: 1
        } };
}
function receipt(...rows) {
    return { txHash: 'AA'.repeat(32), engineResult: 'tesSUCCESS', validated: true, meta: { TransactionResult: 'tesSUCCESS', HookExecutions: rows } };
}
const expected = { handler: 'control', returns: ['primary'] };
test('parameters encode exact native version, opcode and flag', () => {
    const f = fields({ HookParameters: parameters('setPrimary', { ...domainFields('ALICE', 'XAH'), flag: boolBytes(false) }) });
    assert.equal(f.xn_v.toString('hex'), '02');
    assert.equal(f.op[0], 3);
    assert.equal(f.label.toString(), 'alice');
    assert.equal(f.flag.toString('hex'), '00');
    assert.throws(() => parameters('setPrimary', { op: Buffer.from([2]) }));
});
test('existing operation IDs remain 0..14; URIBase uses 16 and reconcile uses 17 with 15 reserved', () => assert.deepEqual(Object.values(sdk.OPERATIONS), [...Array.from({ length: 15 }, (_, i) => i),16,17]));
test('strict native numeric/boolean boundaries', () => {
    assert.equal(coinBytes(65535).toString('hex'), '0000ffff');
    for (const n of [-1, 65536, 1.5, NaN])
        assert.throws(() => coinBytes(n));
    for (const v of [undefined, 0, 1, 'true'])
        assert.throws(() => boolBytes(v));
    const prices = Array(10).fill(0n);
    prices[9] = 0xffffffffffffffffn;
    assert.equal(priceBytes(prices).readBigUInt64BE(72), prices[9]);
    assert.throws(() => priceBytes(Array(10).fill(-1n)));
    assert.throws(() => priceBytes([1n]));
});
test('address/text size is measured in bytes', () => {
    assert.equal(addressBytes(Buffer.alloc(128)).length, 256);
    assert.throws(() => addressBytes(Buffer.alloc(129)));
    assert.throws(() => addressBytes(Buffer.alloc(0)));
    assert.equal(textValueBytes('é'.repeat(64)).length, 128);
    assert.throws(() => textValueBytes('é'.repeat(65)));
    assert.throws(() => domainFields('a'.repeat(58), 'xah'));
});
test('Xahau validator and wallet sign native Invoke offline', () => {
    const wallet = Wallet.generate(), tx = {
        TransactionType: 'Invoke', Account: wallet.classicAddress, Destination: treasury, Fee: '300000', Sequence: 1, LastLedgerSequence: 100, NetworkID: 21338, HookParameters: parameters('setPrimary', { ...domainFields('alice', 'xah'), flag: boolBytes(true) })
    };
    validate(tx);
    assert(wallet.sign(tx).tx_blob.length > 0);
    validate({ TransactionType: 'URITokenBuy', Account: buyer, URITokenID: id, Amount: '0' });
});
for (const [method, args, op, handler] of [
    ['setPrimary', { label: 'alice', tld: 'xah', flag: true }, 3, 'control'], ['setAddr', { label: 'alice', tld: 'xah', coinType: 144, addr: Buffer.alloc(128, 0xab) }, 4, 'set-address'], ['clearAddr', { label: 'alice', tld: 'xah', coinType: 60 }, 5, 'set-address'], ['setText', { label: 'alice', tld: 'xah', key: 'description', value: 'test' }, 6, 'set-text'], ['clearText', { label: 'alice', tld: 'xah', key: 'description' }, 7, 'clear-text'], ['reset', { label: 'alice', tld: 'xah' }, 9, 'control']
])
    test('resolver ' + method + ' native Invoke', async () => {
        const s = ctx(), r = new sdk.ResolverModule(s.c);
        await r[method](args);
        const { tx, options } = s.sent[0];
        validate({ ...tx, Account: buyer });
        assert.equal(tx.TransactionType, 'Invoke');
        assert.equal(tx.Destination, treasury);
        assert.equal(fields(tx).op[0], op);
        assert.equal(options.handler, handler);
        assert(!tx.Memos && !tx.Amount);
    });
test('treasury record Invoke omits self Destination', async () => {
    const s = ctx(treasury);
    await new sdk.ResolverModule(s.c).reset({ label: 'alice', tld: 'xah' });
    assert(!('Destination' in s.sent[0].tx));
    validate({ ...s.sent[0].tx, Account: treasury });
});
test('admin operations use owner-only Invoke with expected opcodes', async () => {
    const s = ctx(treasury), c = new sdk.ControllerModule(s.c, ['xah']);
    await c.addTld('XYZ');
    await c.removeTld('xyz');
    await c.pause();
    await c.unpause();
    assert.deepEqual(s.sent.map(v => fields(v.tx).op[0]), [11, 12, 13, 14]);
    for (const { tx } of s.sent) {
        assert(!tx.Destination && !tx.Amount && !tx.Memos);
        validate({ ...tx, Account: treasury });
    }
    await assert.rejects(async () => new sdk.ControllerModule(ctx().c, ['xah']).pause(), e => e.code === 'NOT_ADMIN');
});
test('role grants unsupported and hasRole follows owner-only policy', async () => {
    await assert.rejects(new sdk.TreasuryModule().setRole({ role: 'admin', address: buyer, enabled: true }), e => e.code === 'UNSUPPORTED_OPERATION');
    const c = new sdk.ControllerModule(ctx().c, []);
    assert.equal(await c.hasRole('admin', buyer), false);
    assert.equal(await c.hasRole('admin', treasury), true);
});
test('register avoids self Payment and uses explicit recipient transport', async () => {
    const s = ctx(treasury), r = new sdk.RegistrarModule(s.c);
    await r.register({ label: 'alice', tld: 'xah', recipient: buyer });
    const { tx } = s.sent[0];
    assert.equal(tx.Destination, buyer);
    assert.equal(fields(tx).recipient.toString(), Buffer.from(decodeAccountID(buyer)).toString('hex').toUpperCase());
    validate({ ...tx, Account: treasury });
    await assert.rejects(r.register({ label: 'alice', tld: 'xah', recipient: treasury }));
    await r.register({ label: 'alice', tld: 'xah', recipient: treasury, paymentDestination: other });
    assert.equal(s.sent[1].tx.Destination, other);
});
test('buy uses live price and returns pending issuance status', async () => {
    const s = ctx(), p = Buffer.alloc(81);
    p[0] = 1;
    for (let i = 0; i < 10; i++)
        p.writeBigUInt64BE(BigInt(i + 1) * 1000n, 1 + i * 8);
    s.values.set(pricingKey(), p);
    const r = await new sdk.RegistrarModule(s.c).buy({ label: 'alice', tld: 'xah' });
    assert.equal(r.status, 'pending');
    assert.equal(s.sent[0].tx.Amount, '5000');
    assert.equal(fields(s.sent[0].tx).op[0], 2);
    assert(!fields(s.sent[0].tx).recipient);
    assert(s.reads[0].bypassCache);
});
test('pricing serializes full 80-byte BE payload', async () => {
    const s = ctx(treasury);
    await new sdk.RegistrarModule(s.c).setPricing(Array(10).fill(123456789n));
    assert.equal(fields(s.sent[0].tx).prices.length, 80);
    assert.equal(fields(s.sent[0].tx).prices.readBigUInt64BE(72), 123456789n);
    assert(!s.sent[0].tx.Destination);
});
test('multi-hook receipt selects control acknowledgement', () => {
    const r = transactionResult(receipt(exec('next', '0', '11'.repeat(32)), exec()), treasury, expected, { control: '22'.repeat(32) });
    assert.equal(r.hookReturnString, 'primary');
    assert.equal(r.hookExecutions.length, 2);
});
test('pass-through, wrong hash/account, missing execution cannot succeed', () => {
    for (const rows of [
        [], [exec('not v2')], [exec('next')], [exec('primary', '0', '33'.repeat(32))], [exec('primary', '0', '22'.repeat(32), other)]
    ])
        assert.throws(() => transactionResult(receipt(...rows), treasury, expected, { control: '22'.repeat(32) }), e => e.code === 'HOOK_NOT_EXECUTED');
});
test('hex code decoding and rejection retain specific hook diagnostics', () => {
    const r = receipt(exec('state err', '0000000000000014', '22'.repeat(32), treasury, 2));
    r.engineResult = 'tecHOOK_REJECTED';
    assert.throws(() => transactionResult(r, treasury, expected), e => e.code === 20 && e.message.includes('state err'));
    assert.equal(decodeExecutions(r.meta)[0].returnCode, '20');
    assert.equal(decodeExecutions(r.meta)[0].returnString, 'state err');
});
test('weak claim failure is surfaced even with engine tesSUCCESS', () => assert.throws(() => transactionResult(receipt(exec('await result'), exec('root w', '14', '22'.repeat(32), treasury, 2)), treasury, { handler: 'claim', returns: ['claimed'] }), e => e.code === 20));
test('unvalidated and malformed metadata are rejected', () => {
    assert.throws(() => transactionResult({ ...receipt(exec()), validated: false }, treasury, expected), e => e.code === 'NOT_VALIDATED');
    assert.throws(() => decodeExecutions({ HookExecutions: [{ HookExecution: { HookReturnCode: 'gg' } }] }), e => e.code === 'BAD_METADATA');
});
test('root/hash primary reads stay backward compatible', async () => {
    const s = ctx();
    s.values.set(rootKey('alice', 'xah'), root(buyer, 1));
    s.values.set(primaryOfKey(buyer), Buffer.from(rootKey('alice', 'xah'), 'hex'));
    const r = new sdk.ResolverModule(s.c);
    assert.equal(await r.getOwner(domain), buyer);
    assert.equal(await r.getPrimary(buyer), rootKey('alice', 'xah'));
});
test('native owner verification detects stale root', async () => {
    const s = ctx();
    s.values.set(rootKey('alice', 'xah'), root());
    s.tokens.set(id, token(other));
    await assert.rejects(new sdk.ResolverModule(s.c).getOwner(domain, { verifyOwner: true }), e => e.code === 'OWNERSHIP_MISMATCH');
});
test('owner enumeration paginates at one ledger and resolves primary name', async () => {
    const s = ctx();
    s.values.set(rootKey('alice', 'xah'), root(buyer, 1));
    s.values.set(primaryOfKey(buyer), Buffer.from(rootKey('alice', 'xah'), 'hex'));
    let n = 0;
    s.c.request = async (q) => {
        assert.equal(q.ledger_hash, ledger);
        n++;
        return q.marker ? { account_objects: [token(buyer)] } : { account_objects: [], marker: 'page2' };
    };
    const r = new sdk.ResolverModule(s.c);
    assert.deepEqual(await r.listOwnedDomains(buyer), [domain]);
    assert.equal(await r.getPrimaryName(buyer), domain);
    assert.equal(n, 4);
});
test('pending/offer/claim states use fresh pinned state', async () => {
    const s = ctx(), r = new sdk.RegistrarModule(s.c);
    assert.equal((await r.getRegistrationStatus(domain)).stage, 'available');
    s.values.set(pendingKey(id), pending());
    assert.equal((await r.getRegistrationStatus(domain)).stage, 'pending');
    s.tokens.set(id, token());
    assert.equal((await r.getRegistrationStatus(domain)).stage, 'awaitingClaim');
    s.tokens.set(id, token(buyer));
    assert.equal((await r.getRegistrationStatus(domain)).stage, 'recoveryRequired');
    s.values.delete(pendingKey(id));
    s.values.set(rootKey('alice', 'xah'), root());
    assert.equal((await r.getRegistrationStatus(domain)).stage, 'claimed');
    assert(s.reads.every(o => o.bypassCache && o.ledgerHash === ledger));
});
test('refund is visible and stops offer polling', async () => {
    const s = ctx(), r = new sdk.RegistrarModule(s.c);
    s.values.set(pendingKey(id), pending());
    s.values.set(asyncKey('rfd', id), Buffer.alloc(32));
    assert.equal((await r.getRegistrationStatus(domain)).stage, 'refundPending');
    await assert.rejects(r.waitForOffer(domain, { timeoutMs: 20 }), e => e.code === 'REGISTRATION_FAILED');
});
test('claim requires recipient, emits URITokenBuy and verifies final owner', async () => {
    const s = ctx(), r = new sdk.RegistrarModule(s.c);
    s.values.set(pendingKey(id), pending());
    s.tokens.set(id, token());
    const submit = s.c.submit;
    s.c.submit = async (tx, o) => {
        assert.equal(tx.TransactionType, 'URITokenBuy');
        assert.equal(tx.Amount, '0');
        validate({ ...tx, Account: buyer });
        s.tokens.set(id, token(buyer));
        s.values.delete(pendingKey(id));
        s.values.set(rootKey('alice', 'xah'), root());
        return submit(tx, o);
    };
    await r.claim(domain);
    assert.equal((await r.getRegistrationStatus(domain)).owner, buyer);
});
test('another recipient cannot claim or use buyAndClaim', async () => {
    const s = ctx(other), r = new sdk.RegistrarModule(s.c);
    s.values.set(pendingKey(id), pending());
    s.tokens.set(id, token());
    await assert.rejects(r.claim(domain), e => e.code === 'NOT_RECIPIENT');
    await assert.rejects(r.buyAndClaim({ label: 'alice', tld: 'xah', recipient: buyer }), e => e.code === 'NOT_RECIPIENT');
    assert.equal(s.sent.length, 0);
});
test('poll timeout/abort and unfinished claim are reported', async () => {
    const s = ctx(), r = new sdk.RegistrarModule(s.c);
    await assert.rejects(r.waitForOffer(domain, { timeoutMs: 2, pollIntervalMs: 1 }), e => e.code === 'TIMEOUT');
    const a = new AbortController();
    a.abort();
    await assert.rejects(r.waitForOffer(domain, { signal: a.signal }), e => e.code === 'ABORTED');
    s.values.set(pendingKey(id), pending());
    s.tokens.set(id, token());
    await assert.rejects(r.claim(domain), e => e.code === 'CLAIM_NOT_FINALIZED');
});
function client(overrides = {}) {
    return new sdk.XahauNameClient({
        wss: 'wss://xahau-test.net', treasury, namespaceId: namespace, expectedNetworkId: 21338, ...overrides
    });
}
test('namespace must be explicit; network mismatch disconnects', async () => {
    assert.throws(() => new sdk.XahauNameClient({ wss: 'wss://xahau-test.net', treasury }));
    const c = client();
    c.rawClient.isConnected = () => true;
    c.rawClient.networkID = 1;
    let disconnected = false;
    c.rawClient.disconnect = async () => {
        disconnected = true;
    };
    await assert.rejects(c.connect(), e => e.code === 'WRONG_NETWORK');
    assert(disconnected);
});
test('cache clones buffers, bypasses stale null and separates ledger hashes', async () => {
    const c = client();
    let value = null, n = 0;
    c.rawClient.request = async () => {
        n++;
        if (!value)
            throw { data: { error: 'entryNotFound' } };
        return { result: { node: { HookStateData: value.toString('hex') } } };
    };
    const key = '11'.repeat(32);
    assert.equal(await c.readState(key), null);
    value = Buffer.from('ab', 'hex');
    assert.equal(await c.readState(key), null);
    assert.equal((await c.readState(key, { bypassCache: true })).toString('hex'), 'ab');
    const b = await c.readState(key, { ledgerHash: ledger });
    b[0] = 0;
    assert.equal((await c.readState(key, { ledgerHash: ledger }))[0], 0xab);
    await c.readState(key, { ledgerHash: 'CD'.repeat(32) });
    assert.equal(n, 4);
});
test('client submission decodes receipt and clears caches', async () => {
    const c = client({ signer: { address: buyer, signAndSubmit: async () => receipt(exec('next', '0', '11'.repeat(32)), exec()) } });
    c.rawClient.isConnected = () => true;
    c.rawClient.networkID = 21338;
    const r = await c.resolver.setPrimary({ label: 'alice', tld: 'xah', flag: true });
    assert.equal(r.hookReturnString, 'primary');
});
test('CJS and native ESM expose equivalent public APIs', async () => {
    const esm = await import('../dist/index.mjs');
    assert.deepEqual(Object.keys(esm).sort(),Object.keys(sdk).sort());
    for (const name of Object.keys(sdk))assert.equal(typeof esm[name],typeof sdk[name],name);
    assert.deepEqual(esm.parameters('setPrimary',{flag:Buffer.from([1])}),sdk.parameters('setPrimary',{flag:Buffer.from([1])}));
    assert.equal(esm.util.rootKey('alice','xah'),sdk.util.rootKey('alice','xah'));
    assert.deepEqual(esm.PROFILE_TEXT_KEYS,sdk.PROFILE_TEXT_KEYS);
});
test('external signer receives bound NetworkID and rejects a conflicting network before signing', async () => {
    let sent;
    const c = client({ signer: { address: buyer, signAndSubmit: async (tx) => {
                sent = tx;
                return receipt(exec());
            } } });
    c.rawClient.isConnected = () => true;
    c.rawClient.networkID = 21338;
    await c.resolver.setPrimary({ label: 'alice', tld: 'xah', flag: false });
    assert.equal(sent.NetworkID, 21338);
    sent = null;
    await assert.rejects(c.submit({ NetworkID: 1 }, expected), e => e.code === 'WRONG_NETWORK');
    assert.equal(sent, null);
});
test('prototype property names cannot become native operations', () => assert.throws(() => parameters('toString')));
test('Node wallet signer autofills, signs and consumes validated multi-hook metadata', async () => {
    const wallet = Wallet.generate(), c = client({ wallet });
    let submitted;
    c.rawClient.isConnected = () => true;
    c.rawClient.networkID = 21338;
    c.rawClient.autofill = async (tx) => ({ ...tx, Fee: '300000', Sequence: 1, LastLedgerSequence: 100 });
    c.rawClient.submitAndWait = async (blob) => {
        submitted = blob;
        return { result: { hash: 'AA'.repeat(32), validated: true, meta: receipt(exec('next', '0', '11'.repeat(32)), exec()).meta } };
    };
    const r = await c.resolver.setPrimary({ label: 'alice', tld: 'xah', flag: true });
    assert.equal(r.hookReturnString, 'primary');
    assert(submitted.length > 0);
});
test('deployment mismatch fails connection before any write', async () => {
    const c = client({ hookHashes: { control: '99'.repeat(32) } });
    c.rawClient.isConnected = () => true;
    c.rawClient.networkID = 21338;
    c.rawClient.request = async () => ({ result: { account_objects: [] } });
    c.rawClient.disconnect = async () => {
    };
    await assert.rejects(c.connect(), e => e.code === 'DEPLOYMENT_MISMATCH');
});
test('buyAndClaim progresses through queued offer and verified final ownership', async () => {
    const s = ctx(), r = new sdk.RegistrarModule(s.c), price = Buffer.alloc(81);
    price[0] = 1;
    for (let i = 0; i < 10; i++)
        price.writeBigUInt64BE(1000n, 1 + 8 * i);
    s.values.set(pricingKey(), price);
    let polls = 0;
    const submit = s.c.submit;
    s.c.ledgerHash = async () => {
        // Emitted state becomes visible in a new validated ledger, never by
        // mutating the same immutable snapshot on a repeated object read.
        if (s.values.has(pendingKey(id)) && ++polls >= 2 && !s.tokens.has(id))
            s.tokens.set(id, token());
        return polls.toString(16).padStart(64,'0').toUpperCase();
    };
    s.c.ledgerObject = async () => s.tokens.get(id) ?? null;
    s.c.submit = async (tx, o) => {
        if (tx.TransactionType === 'Payment')
            s.values.set(pendingKey(id), pending());
        else {
            s.tokens.set(id, token(buyer));
            s.values.delete(pendingKey(id));
            s.values.set(rootKey('alice', 'xah'), root());
        }
        return submit(tx, o);
    };
    const result = await r.buyAndClaim({ label: 'alice', tld: 'xah' }, { timeoutMs: 500, pollIntervalMs: 1 });
    assert.equal(result.purchase.status, 'pending');
    assert.equal(result.status.stage, 'claimed');
    assert.equal(result.status.owner, buyer);
    assert.equal(s.sent.length, 2);
});

const metadataBase='https://xrpdomains.xyz/api/nftdomains/metadata/';
function mappedFixture(){const s=ctx(),uri=metadataBase+domain,mappedId=sdk.util.computeUritokenIdFromURI(treasury,uri);s.values.set(sdk.util.tokenKey('alice','xah'),Buffer.from(mappedId,'hex'));s.values.set(sdk.util.labelOfKey(mappedId),Buffer.from(domain));s.values.set(sdk.util.uriBaseKey(),Buffer.from(metadataBase));s.values.set(rootKey('alice','xah'),root(buyer,1));const t={...token(buyer),index:mappedId,URI:Buffer.from(uri).toString('hex')};s.tokens.set(mappedId,t);return{...s,uri,mappedId,t};}
test('URIBase validates HTTPS path and rejects unsafe or oversized bases',()=>{assert.equal(sdk.uriBaseBytes(metadataBase).toString(),metadataBase);for(const x of ['http://example.com/','https://example.com/no-slash','https://example.com/?q=1','https://example.com/#x','https://user@example.com/','https://example.com/a/../','https://example.com/a%20b/','https://example.com/'+'x'.repeat(120)+'/'])assert.throws(()=>sdk.uriBaseBytes(x));});
test('URIBase setter is owner-only and encodes Invoke opcode 16',async()=>{const s=ctx(treasury),r=new sdk.RegistrarModule(s.c);await r.setURIBase(metadataBase);assert.equal(s.sent[0].tx.TransactionType,'Invoke');assert.equal(fields(s.sent[0].tx).op[0],16);assert.equal(fields(s.sent[0].tx).uri_base.toString(),metadataBase);await assert.rejects(new sdk.RegistrarModule(ctx().c).setURIBase(metadataBase),e=>e.code==='NOT_ADMIN');});
test('buy and register reject caller-controlled URI fields',async()=>{for(const field of ['uri','URI','customURI','uriBase','URIBase']){const args={label:'alice',tld:'xah',[field]:'https://evil.example/'};await assert.rejects(new sdk.RegistrarModule(ctx().c).buy(args),e=>e.code==='INVALID_ARGUMENT');await assert.rejects(new sdk.RegistrarModule(ctx(treasury).c).register({...args,recipient:buyer}),e=>e.code==='INVALID_ARGUMENT');}});
test('URL token identity is looked up from forward/reverse mappings',async()=>{const s=mappedFixture(),r=new sdk.RegistrarModule(s.c);assert.equal(await r.getTokenId(domain),s.mappedId);assert.equal(await r.getTokenURI(domain),s.uri);assert.equal(await new sdk.ResolverModule(s.c).getOwner(domain,{verifyOwner:true}),buyer);assert.equal((await r.getRegistrationStatus(domain)).stage,'claimed');});
test('changing current URIBase does not reinterpret an existing URL token',async()=>{const s=mappedFixture(),r=new sdk.RegistrarModule(s.c);s.values.set(sdk.util.uriBaseKey(),Buffer.from('https://other.example/metadata/'));assert.equal(await r.getTokenId(domain),s.mappedId);assert.equal(await r.getTokenURI(domain),s.uri);});
test('URL owned-domain enumeration and primary use canonical reverse mapping',async()=>{const s=mappedFixture();s.values.set(primaryOfKey(buyer),Buffer.from(rootKey('alice','xah'),'hex'));s.c.request=async()=>({account_objects:[s.t]});const r=new sdk.ResolverModule(s.c);assert.deepEqual(await r.listOwnedDomains(buyer),[domain]);assert.equal(await r.getPrimaryName(buyer),domain);});
test('malformed forward map fails closed',async()=>{const s=mappedFixture();s.values.set(sdk.util.tokenKey('alice','xah'),Buffer.alloc(2));await assert.rejects(new sdk.RegistrarModule(s.c).getRegistrationStatus(domain),e=>e.code==='BAD_STATE');});
test('mapped token with tampered URI or reverse identity is rejected',async()=>{const s=mappedFixture(),r=new sdk.ResolverModule(s.c);s.t.URI=Buffer.from(metadataBase+'wrong.xah').toString('hex');await assert.rejects(r.getOwner(domain,{verifyOwner:true}),e=>e.code==='OWNERSHIP_MISMATCH');s.t.URI=Buffer.from(s.uri).toString('hex');s.values.set(sdk.util.labelOfKey(s.mappedId),Buffer.from('wrong.xah'));await assert.rejects(r.getOwner(domain,{verifyOwner:true}),e=>e.code==='OWNERSHIP_MISMATCH');});
test('available domain reports prospective URL ID but no registered token',async()=>{const s=ctx();s.values.set(sdk.util.uriBaseKey(),Buffer.from(metadataBase));const r=new sdk.RegistrarModule(s.c);assert.equal((await r.getRegistrationStatus(domain)).uritokenId,sdk.util.computeUritokenIdFromURI(treasury,metadataBase+domain));assert.equal(await r.getTokenId(domain),null);assert.equal(await r.getTokenURI(domain),null);});
test('a reserved domain mapping without token/pending is recoveryRequired',async()=>{const s=mappedFixture();s.tokens.clear();s.values.delete(rootKey('alice','xah'));assert.equal((await new sdk.RegistrarModule(s.c).getRegistrationStatus(domain)).stage,'recoveryRequired');});

test('disconnect clears transport reconnect work even when socket is already closed',async()=>{const c=new sdk.XahauNameClient({wss:'wss://xahau-test.net',treasury,namespaceId:namespace});let n=0;c.client={isConnected:()=>false,disconnect:async()=>{n++;}};await c.disconnect();assert.equal(n,1);});
test('failed connect cleans a closed transport and reports connection stage',async()=>{const c=new sdk.XahauNameClient({wss:'wss://xahau-test.net',treasury,namespaceId:namespace});let n=0;c.client={isConnected:()=>false,connect:async()=>{throw Error('connection failed');},disconnect:async()=>{n++;}};await assert.rejects(c.connect(),e=>e.code==='RPC_CONNECTION_FAILED'&&e.message==='connection failed'&&e.details.phase==='connect'&&e.details.endpoint==='wss://xahau-test.net');assert.equal(n,1);});
test('connection timeout is configurable and rejects invalid timer values',()=>{
    const config={wss:'wss://xahau-test.net',treasury,namespaceId:namespace};
    assert.equal(new sdk.XahauNameClient(config).rawClient.connection.config.connectionTimeout,15000);
    assert.equal(new sdk.XahauNameClient({...config,connectionTimeoutMs:25000}).rawClient.connection.config.connectionTimeout,25000);
    for(const value of [0,-1,NaN,Infinity,1.5,2147483648])assert.throws(()=>new sdk.XahauNameClient({...config,connectionTimeoutMs:value}),e=>e.code==='INVALID_ARGUMENT');
});
test('concurrent connect callers share cleanup and can reconnect after failure without submitting',async()=>{
    const c=new sdk.XahauNameClient({wss:'wss://xahau-test.net',treasury,namespaceId:namespace});
    let calls=0,cleanups=0,reject;
    c.client={isConnected:()=>false,connect:()=>{calls++;return new Promise((_resolve,r)=>{reject=r;});},disconnect:async()=>{cleanups++;}};
    const a=c.connect(),b=c.connect();assert.equal(calls,1);
    const checks=[assert.rejects(a,e=>e.code==='RPC_CONNECTION_FAILED'),assert.rejects(b,e=>e.code==='RPC_CONNECTION_FAILED')];
    reject(Error('timeout'));await Promise.all(checks);assert.equal(cleanups,1);
    c.client.connect=async()=>{calls++;};await c.connect();assert.equal(calls,2);
});
test('connect callers await deployment verification before reporting success',async()=>{
    const hash='AA'.repeat(32),c=new sdk.XahauNameClient({wss:'wss://xahau-test.net',treasury,namespaceId:namespace,hookHashes:{control:hash}});
    let verify,requests=0,finished=false;
    c.client={isConnected:()=>true,request:async()=>{requests++;return new Promise(resolve=>{verify=resolve;});}};
    const a=c.connect(),b=c.connect().then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);assert.equal(requests,1);
    verify({result:{account_objects:[{Hooks:[{Hook:{HookHash:hash}}]}]}});await Promise.all([a,b]);assert.equal(finished,true);
});

// Ledger-based complete record discovery, including legacy unnamed custom data.
function profileFixture(){const s=ctx();s.values.set(rootKey('alice','xah'),root());const idx=Buffer.alloc(124);idx[0]=1;idx.writeUInt16BE(2,1);idx.writeUInt16BE(144,4);idx.writeUInt16BE(60,6);idx[3]=2;idx[34]=1;idx[35]=11;idx[40]=255;idx[41]=3;s.values.set(sdk.util.recordsKey('alice','xah'),idx);const name='custom.telegram',key=sdk.util.textKey('alice','xah',name);s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.concat([Buffer.from(key,'hex'),Buffer.from(name)]));s.values.set(sdk.util.addrKey('alice','xah',144),Buffer.from('ab','hex'));s.values.set(sdk.util.addrKey('alice','xah',60),Buffer.from('cd','hex'));s.values.set(sdk.util.textKey('alice','xah','description'),Buffer.from('hello'));s.values.set(key,Buffer.from('telegram-value'));return {...s,idx,name,key};}
test('describe automatically reads all indexed addresses, standard and custom texts at one ledger',async()=>{const s=profileFixture(),p=await new sdk.ResolverModule(s.c).describe(domain);assert.deepEqual(Object.keys(p.addrs).sort(),['144','60']);assert.deepEqual(p.texts,{'description':'hello','custom.telegram':'telegram-value'});assert.deepEqual(p.unnamedTexts,{});assert.equal(p.textKeysComplete,true);assert(s.reads.every(o=>o.ledgerHash===ledger));});
test('getRecordKeys returns complete canonical inventory',async()=>{const s=profileFixture();assert.deepEqual(await new sdk.ResolverModule(s.c).getRecordKeys('ALICE.XAH'),{addrs:[60,144],texts:['custom.telegram','description'],unnamedTextStateKeys:[]});});
test('legacy custom slot exposes value by hash and marks missing key names',async()=>{const s=profileFixture();s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.from(s.key,'hex'));const p=await new sdk.ResolverModule(s.c).describe(domain);assert.equal(p.textKeysComplete,false);assert.deepEqual(p.unnamedTexts,{[s.key]:'telegram-value'});assert.equal(p.texts.description,'hello');});
test('explicit empty selections still skip profile values',async()=>{const s=profileFixture(),p=await new sdk.ResolverModule(s.c).describe(domain,{addrs:[],texts:[]});assert.deepEqual(p.addrs,{});assert.deepEqual(p.texts,{});assert.deepEqual(p.unnamedTexts,{});});
test('explicit custom names remain readable on old deployments without name slots',async()=>{const s=profileFixture();s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.from(s.key,'hex'));const p=await new sdk.ResolverModule(s.c).describe(domain,{texts:[s.name]});assert.equal(p.texts[s.name],'telegram-value');assert.equal(p.textKeysComplete,false);});
test('describe rejects an invalid custom name/hash mapping',async()=>{const s=profileFixture();s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.concat([Buffer.from(s.key,'hex'),Buffer.from('wrong.name')]));await assert.rejects(new sdk.ResolverModule(s.c).describe(domain),e=>e.code==='BAD_STATE');});
test('record discovery fails closed on invalid counts, slots, lengths and missing state',async()=>{for(const mutate of [s=>s.idx[0]=2,s=>s.idx[3]=16,s=>s.idx.writeUInt16BE(16,1),s=>s.idx[41]=15,s=>s.values.delete(sdk.util.textSlotKey('alice','xah',3)),s=>s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.alloc(31)),s=>s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.alloc(73))]){const s=profileFixture();mutate(s);await assert.rejects(new sdk.ResolverModule(s.c).getRecordKeys(domain),e=>e.code==='BAD_STATE');}});
test('record discovery rejects duplicate descriptors',async()=>{const s=profileFixture();s.idx[3]=3;s.idx[46]=255;s.idx[47]=3;await assert.rejects(new sdk.ResolverModule(s.c).getRecordKeys(domain),e=>e.code==='BAD_STATE');});
test('custom __proto__ name is returned as an own property safely',async()=>{const s=profileFixture(),name='__proto__',key=sdk.util.textKey('alice','xah',name);s.values.set(sdk.util.textSlotKey('alice','xah',3),Buffer.concat([Buffer.from(key,'hex'),Buffer.from(name)]));s.values.set(key,Buffer.from('safe'));const p=await new sdk.ResolverModule(s.c).describe(domain);assert.equal(Object.getPrototypeOf(p.texts),Object.prototype);assert(Object.hasOwn(p.texts,name));assert.equal(p.texts[name],'safe');});
test('missing root returns null, empty index returns empty profile',async()=>{const s=ctx(),r=new sdk.ResolverModule(s.c);assert.equal(await r.describe(domain),null);s.values.set(rootKey('alice','xah'),root());const p=await r.describe(domain);assert.deepEqual(p.addrs,{});assert.deepEqual(p.texts,{});assert.equal(p.textKeysComplete,true);});

test("Solana uses SLIP-0044 coin type 501",()=>assert.equal(require("../dist/constants").COIN_TYPES.SOL,501));

test('owner lock is retired before signing; opcode stays reserved for compatibility',async()=>{const s=ctx();const r=new sdk.ResolverModule(s.c);await assert.rejects(r.lock({label:'alice',tld:'xah'}),e=>e.code==='UNSUPPORTED_OPERATION');assert.equal(sdk.OPERATIONS.lock,8);});

test("reserved labels reject before signing",()=>{for(const label of ["xahau","treasury","admin","root","www"])assert.throws(()=>domainFields(label,"xah"));});


test('missing validation flag cannot establish a successful operation',()=>{
 const r=receipt(exec());delete r.validated;
 assert.throws(()=>transactionResult(r,treasury,expected),e=>e.code==='NOT_VALIDATED');
});
test('rejection identifies the actual failing handler, not just the requested operation',()=>{
 const r=receipt(exec('not owner','c','44'.repeat(32),treasury,2));r.engineResult='tecHOOK_REJECTED';
 assert.throws(()=>transactionResult(r,treasury,{handler:'profile',returns:['profile set']},{authorization:'44'.repeat(32),profile:'55'.repeat(32)}),e=>e.code===12&&e.details.failure.handler==='authorization'&&e.details.failure.expectedHandler==='profile'&&e.details.failure.hookHash==='44'.repeat(32));
});

test('public owner and profile reads verify native ownership by default',async()=>{
 const s=mappedFixture();s.t.Owner=other;
 const client=new sdk.XahauNameClient(sdk.TESTNET);client.resolver=new sdk.ResolverModule(s.c);
 await assert.rejects(client.getOwner(domain),e=>e.code==='OWNERSHIP_MISMATCH');
 await assert.rejects(client.resolve(domain),e=>e.code==='OWNERSHIP_MISMATCH');
 await assert.rejects(client.describe(domain),e=>e.code==='OWNERSHIP_MISMATCH');
 await assert.rejects(client.getOwner(domain,{verifyOwner:undefined}),e=>e.code==='OWNERSHIP_MISMATCH');
 await assert.rejects(client.describe(domain,{verifyOwner:undefined}),e=>e.code==='OWNERSHIP_MISMATCH');
 assert.equal(await client.getOwner(domain,{verifyOwner:false}),buyer);
});

for(const marker of ['pending','mnt','ofr','rfd'])test('registration never claims root plus '+marker,async()=>{const x=ctx();x.values.set(rootKey('alice','xah'),root());x.tokens.set(id,token(buyer));x.values.set(marker==='pending'?pendingKey(id):asyncKey(marker,id),marker==='pending'?pending():Buffer.alloc(32,1));assert.equal((await new sdk.RegistrarModule(x.c).getRegistrationStatus(domain)).stage,'recoveryRequired');});
test('reconcile sends one strong Invoke, not a repeated native buy or burn',async()=>{const x=ctx();x.values.set(sdk.util.tokenKey('alice','xah'),Buffer.from(id,'hex'));await new sdk.RegistrarModule(x.c).reconcile(domain);assert.equal(x.sent.length,1);assert.equal(x.sent[0].tx.TransactionType,'Invoke');assert.equal(x.sent[0].tx.Destination,treasury);const p=Object.fromEntries(x.sent[0].tx.HookParameters.map(p=>[Buffer.from(p.HookParameter.HookParameterName,'hex').toString(),p.HookParameter.HookParameterValue]));assert.equal(p.op,'11');assert.equal(p.token,id);assert.equal(x.sent[0].options.handler,'claim');});
test('journal retains identity after partial burn removes forward and reverse maps',async()=>{const x=ctx(),j=Buffer.alloc(67+domain.length);j[0]=1;j[1]=1;Buffer.from(id,'hex').copy(j,2);root().copy(j,34);j[66]=domain.length;j.write(domain,67);x.values.set(sdk.util.recoveryKey('alice','xah'),j);const r=new sdk.RegistrarModule(x.c);assert.equal((await r.getRegistrationStatus(domain)).stage,'recoveryRequired');await r.reconcile(domain);assert.equal(x.sent[0].tx.HookParameters.find(p=>p.HookParameter.HookParameterName==='746F6B656E').HookParameter.HookParameterValue,id);await assert.rejects(new sdk.ResolverModule(x.c).getOwner(domain),e=>e.code==='OWNERSHIP_MISMATCH');j[67]=0;await assert.rejects(r.reconcile(domain),e=>e.code==='BAD_STATE');});

test('treasury reconciliation invokes its own hook without a self Destination',async()=>{const x=ctx(treasury);await new sdk.RegistrarModule(x.c).reconcile(domain);assert.equal(x.sent.length,1);assert.equal(x.sent[0].tx.TransactionType,'Invoke');assert.equal(x.sent[0].tx.Destination,undefined);});
