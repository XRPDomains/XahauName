const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../build/current'), parts = require('../config/handlers.json');
const hash = value => crypto.createHash('sha512').update(value).digest().subarray(0, 32);
const owner = Buffer.alloc(20, 0x22), issuer = Buffer.alloc(20, 0x11), id = hash('validation token'), rows = [];
const key = value => hash(value).toString('hex');
const snapshot = values => JSON.stringify([...values].map(([k, v]) => [k, v.toString('hex')]).sort());
const uint = n => {const b = Buffer.alloc(4); b.writeUInt32BE(n); return b;};
function state(options) {
    const pricing = Buffer.alloc(81); pricing[0] = 1;
    for (let i = 0; i < 10; i++) pricing.writeBigUInt64BE(12n, 1 + 8 * i);
    const values = new Map([[key('_uri_base_v1'), Buffer.from('https://example.com/metadata/')]]);
    if (!options.noPricing) values.set(key('_pricing_v1'), pricing);
    if (options.paused) values.set(key('_paused'), Buffer.from([1]));
    if (options.disabledTld) values.set(key('_tld:xah'), Buffer.from([0]));
    if (options.claimed) {
        const value = Buffer.alloc(32); owner.copy(value);
        values.set(key('alice.xah:root'), value);
        values.set(key('alice.xah:token'), id);
        values.set(Buffer.concat([Buffer.from('lof:'), id.subarray(0, 28)]).toString('hex'), Buffer.from('alice.xah'));
    }
    return values;
}
function run(op, input = {}, options = {}) {
    const values = options.values ?? state(options), before = snapshot(values), traces = [];
    const params = new Map([['xn_v', Buffer.from([2])], ['op', Buffer.from([op])], ['label', Buffer.from('alice')], ['tld', Buffer.from('xah')]]);
    for (const [k, v] of Object.entries(input)) {
        if (v === undefined) params.delete(k); else params.set(k, Buffer.isBuffer(v) ? v : Buffer.from(v));
    }
    const amount = Buffer.alloc(8); amount.writeBigUInt64BE(0x4000000000000000n | BigInt(options.drops ?? 12));
    const fields = new Map([[524289, options.sender ?? owner], [393217, options.iou ? Buffer.alloc(48, 0x80) : amount]]);
    if (options.partial) fields.set(131074, Buffer.from([0, 2, 0, 0]));
    for (const name of parts) {
        const t = require(path.join(root, name, 'runtime.cjs')).setup({values, params, fields, txType: options.txType ?? 0, enforceGuards: true});
        const r = t.invoke('hook', 0); traces.push({name, r});
        if (r.kind === 'rollback' || r.kind === 'guard') {
            // Match transaction-wide atomicity, including earlier handlers.
            return {values, before, traces, failed: name, result: r};
        }
    }
    return {values, before, traces};
}
function check(name, op, input, expected, options = {}) {
    try {
        const r = run(op, input, options);
        if (typeof expected === 'number') {
            assert.equal(r.result?.kind, 'rollback', JSON.stringify(r.traces));
            assert.equal(r.result.code, expected);
            // Input failures tested here must reject before writes.
            assert.equal(snapshot(r.values), r.before);
        } else {
            assert(!r.failed, JSON.stringify(r.traces));
            assert(r.traces.some(t => t.r.text === expected), JSON.stringify(r.traces));
        }
        rows.push({name, pass: true, expected, failingHandler: r.failed ?? null});
    } catch (e) {rows.push({name, pass: false, error: e.stack});}
}
for (const [name, label, code] of [
    ['one-character label', 'a', 'minting'], ['57-character label', 'a'.repeat(57), 'minting'],
    ['empty label', '', 3], ['missing label', undefined, 3], ['58-character label', 'a'.repeat(58), 10],
    ['65-character label exceeds transport buffer', 'a'.repeat(65), 3],
    ['uppercase normalizes', 'ALICE', 'minting'], ['mixed case normalizes', 'AlIcE', 'minting'],
    ['leading whitespace', ' alice', 34], ['trailing whitespace', 'alice ', 34], ['internal whitespace', 'al ice', 34],
    ['tab', 'al\tice', 34], ['line break', 'alice\n', 34],
    ['leading hyphen', '-alice', 10], ['trailing hyphen', 'alice-', 10], ['internal hyphen', 'al-ice', 'minting'],
    ['underscore', 'al_ice', 10], ['dot inside label', 'al.ice', 10], ['full name in label', 'alice.xah', 10],
    ['slash', 'al/ice', 10], ['colon', 'al:ice', 10], ['at-sign', 'al@ice', 10],
    ['HTML-like input', '<alice>', 10], ['NUL', 'al\0ice', 10], ['Unicode', 'alicé', 10],
    ['emoji', 'alice😀', 10], ['zero-width space', 'al\u200bice', 10],
]) check('name: ' + name, 2, {label}, code);
for (const label of ['xahau', 'treasury', 'admin', 'root', 'www']) check('reserved: ' + label, 2, {label}, 10);
for (const [name, tld, code] of [
    ['missing', undefined, 3], ['empty', '', 3], ['one character', 'x', 36], ['nine characters', 'abcdefghi', 36],
    ['uppercase', 'XAH', 'minting'], ['punctuation', 'xa!', 36], ['disabled unknown', 'zz', 33],
]) check('tld: ' + name, 2, {tld}, code);
check('built-in TLD tombstone remains disabled', 2, {}, 33, {disabledTld: true});
check('duplicate claimed name', 2, {}, 31, {claimed: true});
check('price missing', 2, {}, 51, {noPricing: true});
check('zero purchase amount', 2, {}, 50, {drops: 0});
check('one drop below price', 2, {}, 50, {drops: 11});
check('exact price', 2, {}, 'minting', {drops: 12});
check('overpayment currently accepted without change refund', 2, {}, 'minting', {drops: 13});
check('issuance paused', 2, {}, 52, {paused: true});
check('partial payment', 2, {}, 54, {partial: true});
check('issued-currency amount', 2, {}, 53, {iou: true});
check('nonadmin register', 1, {}, 40);
try {
    const first = run(2), second = run(2, {}, {values: first.values});
    assert(!first.failed); assert.equal(second.result.code, 55); assert.equal(snapshot(second.values), second.before);
    rows.push({name: 'second buyer cannot reserve a pending name', pass: true, expected: 55});
} catch (e) {rows.push({name: 'second buyer cannot reserve a pending name', pass: false, error: e.stack});}
for (const [name, input, expected] of [
    ['one-byte address', {addr: '00'}, 'addr set'], ['128-byte address', {addr: 'AB'.repeat(128)}, 'addr set'],
    ['129-byte address', {addr: 'AB'.repeat(129)}, 3], ['empty address', {addr: ''}, 3],
    ['odd hex', {addr: 'ABC'}, 3], ['nonhex', {addr: 'GG'}, 3],
    ['coin zero', {coinType: uint(0)}, 'addr set'], ['coin 65535', {coinType: uint(65535)}, 'addr set'],
    ['coin 65536', {coinType: uint(65536)}, 3], ['negative encoded coin', {coinType: uint(0xffffffff)}, 3],
    ['short coin encoding', {coinType: Buffer.alloc(3)}, 3], ['missing coin', {coinType: undefined}, 3],
]) check('address: ' + name, 4, {coinType: uint(144), addr: 'ABCD', ...input}, expected, {claimed: true, txType: 99});
for (const [name, input, expected] of [
    ['one-character custom key', {key: 'z'}, 'text set'], ['40-character key', {key: 'z'.repeat(40)}, 'text set'],
    ['41-character key', {key: 'z'.repeat(41)}, 3], ['empty key', {key: ''}, 3], ['invalid key character', {key: 'custom!'}, 3],
    ['uppercase key normalizes', {key: 'CUSTOM.KEY'}, 'text set'],
    ['128-byte value', {value: 'a'.repeat(128)}, 'text set'], ['129-byte value', {value: 'a'.repeat(129)}, 3],
    ['multibyte UTF-8 counts bytes', {value: 'é'.repeat(64)}, 'text set'], ['empty value requires clear operation', {value: ''}, 3],
]) check('text: ' + name, 6, {key: 'custom.test', value: 'value', ...input}, expected, {claimed: true, txType: 99});
fs.writeFileSync(path.join(root, 'validation-results.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify({passed: rows.filter(r => r.pass).length, total: rows.length, failures: rows.filter(r => !r.pass)}));
if (rows.some(r => !r.pass)) process.exitCode = 1;
