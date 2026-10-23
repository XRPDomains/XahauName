// Active-low transaction bits, except SetHook (22), which is active-high.
function hookMask(types) {
  let mask = ((1n << 256n) - 1n) & ~(1n << 22n);
  for (const type of types) {
    if (!Number.isInteger(type) || type < 0 || type > 255 || type === 22) {
      throw new Error('Unsupported hook transaction type');
    }
    mask &= ~(1n << BigInt(type));
  }
  return mask.toString(16).padStart(64, '0').toUpperCase();
}
module.exports = {hookMask};
