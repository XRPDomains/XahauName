/**
 * Unit tests for key formulas and codecs.  Deterministic — no network.
 *
 * Run: npx tsx test/keys.test.ts
 */

import assert from 'node:assert';
import {
    sha512Half, rootKey, addrKey, textKey, recordsKey,
    pricingKey, pausedKey, tldKey, roleKey, primaryOfKey,
    uriKey, labelOfKey, computeUritokenId,
    splitDomain, joinDomain,
    decodeRoot, decodePricing, priceForLength,
    addressToHex, hexToAddress,
} from '../src/util';
import { ReturnCode, RC_NAMES } from '../src/constants';

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  OK  ${name}`);
    } catch (e: any) {
        console.log(`  FAIL ${name}: ${e.message}`);
        process.exitCode = 1;
    }
}

console.log('=== Hash + split ===');
test('sha512Half returns 32 bytes', () => {
    const h = sha512Half('hello');
    assert.strictEqual(h.length, 32);
});
test('splitDomain alice.xah', () => {
    const r = splitDomain('alice.xah');
    assert.deepStrictEqual(r, { label: 'alice', tld: 'xah' });
});
test('splitDomain lowercases', () => {
    const r = splitDomain('ALICE.XAH');
    assert.deepStrictEqual(r, { label: 'alice', tld: 'xah' });
});
test('joinDomain', () => {
    assert.strictEqual(joinDomain('alice', 'xah'), 'alice.xah');
});

console.log('=== Key builders ===');
test('rootKey deterministic', () => {
    const k1 = rootKey('alice', 'xah');
    const k2 = rootKey('alice', 'xah');
    assert.strictEqual(k1, k2);
    assert.strictEqual(k1.length, 64);
});
test('rootKey different per domain', () => {
    assert.notStrictEqual(rootKey('alice', 'xah'), rootKey('bob', 'xah'));
    assert.notStrictEqual(rootKey('alice', 'xah'), rootKey('alice', 'xahau'));
});
test('addrKey varies by coinType', () => {
    assert.notStrictEqual(
        addrKey('alice', 'xah', 60),
        addrKey('alice', 'xah', 144),
    );
});
test('textKey varies by key', () => {
    assert.notStrictEqual(
        textKey('alice', 'xah', 'avatar'),
        textKey('alice', 'xah', 'description'),
    );
});
test('recordsKey, pricingKey, pausedKey are 64 hex chars', () => {
    assert.strictEqual(recordsKey('alice', 'xah').length, 64);
    assert.strictEqual(pricingKey().length, 64);
    assert.strictEqual(pausedKey().length, 64);
});
test('tldKey', () => {
    const k = tldKey('xah');
    assert.strictEqual(k.length, 64);
});

console.log('=== Address codec ===');
const testR = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';
test('addressToHex round-trip', () => {
    const h = addressToHex(testR);
    assert.strictEqual(h.length, 40);
    const r = hexToAddress(h);
    assert.strictEqual(r, testR);
});
test('roleKey consistent', () => {
    assert.strictEqual(
        roleKey('admin', testR),
        roleKey('admin', testR),
    );
});
test('primaryOfKey consistent', () => {
    assert.strictEqual(primaryOfKey(testR), primaryOfKey(testR));
});

console.log('=== uri + labelOf keys ===');
test('uriKey ascii prefix', () => {
    const utid = '00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF';
    const k = uriKey(utid);
    assert.strictEqual(k.length, 64);
    assert.strictEqual(k.slice(0, 8), '7572693A'); // "uri:" hex
});
test('labelOfKey ascii prefix', () => {
    const utid = '00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF';
    const k = labelOfKey(utid);
    assert.strictEqual(k.length, 64);
    assert.strictEqual(k.slice(0, 8), '6C6F663A'); // "lof:" hex
});

console.log('=== URITokenID ===');
test('computeUritokenId deterministic', () => {
    const id1 = computeUritokenId(testR, 'alice', 'xah');
    const id2 = computeUritokenId(testR, 'alice', 'xah');
    assert.strictEqual(id1, id2);
    assert.strictEqual(id1.length, 64);
});
test('computeUritokenId varies by domain', () => {
    assert.notStrictEqual(
        computeUritokenId(testR, 'alice', 'xah'),
        computeUritokenId(testR, 'bob', 'xah'),
    );
});

console.log('=== Decoders ===');
test('decodeRoot', () => {
    const buf = Buffer.alloc(32);
    const accId = Buffer.from(addressToHex(testR), 'hex');
    accId.copy(buf, 0, 0, 20);
    buf[20] = 0x01; // primary
    buf.writeBigUInt64BE(1729516800n, 21);
    const r = decodeRoot(buf);
    assert.strictEqual(r.owner, testR);
    assert.strictEqual(r.primary, true);
    assert.strictEqual(r.locked, false);
    assert.strictEqual(r.mintedAt, 1729516800);
});

test('decodePricing + priceForLength', () => {
    const buf = Buffer.alloc(81);
    buf[0] = 1;
    for (let i = 0; i < 10; i++) {
        const off = 1 + i * 8;
        buf.writeBigUInt64BE(BigInt((i + 1) * 1_000_000), off);
    }
    const prices = decodePricing(buf);
    assert.strictEqual(prices['1'], 1_000_000n);
    assert.strictEqual(prices['9'], 9_000_000n);
    assert.strictEqual(prices['10+'], 10_000_000n);
    assert.strictEqual(priceForLength(prices, 5), 5_000_000n);
    assert.strictEqual(priceForLength(prices, 15), 10_000_000n);
});

console.log('=== Return codes ===');
test('RC_NAMES has mappings', () => {
    assert.strictEqual(RC_NAMES[0], 'RC_OK');
    assert.strictEqual(RC_NAMES[ReturnCode.PARTIAL_PAYMENT], 'RC_PARTIAL_PAYMENT');
    assert.strictEqual(RC_NAMES[ReturnCode.PRICING_NOT_SET], 'RC_PRICING_NOT_SET');
});

console.log('=== Done ===');
