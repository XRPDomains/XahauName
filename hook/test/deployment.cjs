const assert = require('node:assert/strict');
const {hookMask} = require('../deploy/masks.cjs');
const permits = (mask, type) => type === 22
  ? Boolean(BigInt('0x' + mask) & (1n << 22n))
  : !(BigInt('0x' + mask) & (1n << BigInt(type)));
for (const types of [[], [0, 45, 48], [47, 95], [0, 99]]) {
  const mask = hookMask(types);
  assert.equal(mask.length, 64);
  for (let type = 0; type < 256; type++) {
    assert.equal(permits(mask, type), types.includes(type));
  }
}
assert.throws(() => hookMask([22]));
console.log('Deployment masks: 1,024 permission checks PASS');
