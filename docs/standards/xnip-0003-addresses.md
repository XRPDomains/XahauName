# XNIP-0003: Multichain receiving addresses

- Status: Draft
- Version: 0.1.0
- Created: 2026-10-23
- Category: Resolution
- Depends on: XNIP-0000, XNIP-0001

## Requirements

Receiving addresses MUST be separate binary records indexed by SLIP-0044 coin type, following the byte-oriented model of [ENSIP-9](https://docs.ens.domains/ensip/9/). This implementation supports coin IDs 0..65535 and fifteen addresses per domain; full uint256 and high-bit ENSIP-11 EVM IDs are unsupported.

| Network | Coin type | SDK representation |
| --- | --- | --- |
| Bitcoin |0 | ENS address-encoder script bytes |
| Ethereum |60 |20-byte address |
| XRP |144 | Ripple version-prefixed classic/X-address bytes |
| TRON |195 |21 bytes with41 prefix |
| Solana |501 |32 bytes |
| Xahau |21337 | Ripple-compatible address codec, separate coin ID |

Xahau NetworkID 21338 is testnet transport configuration, not its coin ID. Historical local535/345 records MUST NOT be automatically reinterpreted as XAH/SOL. Unknown supported-range coins MAY use advanced raw bytes; a typed decoder MUST reject unsupported/invalid encoding rather than guess.

New Ripple writes include their version prefix and preserve destination tags. Existing20-byte AccountID records MAY be read through explicit legacy canonicalization. A tag MUST NOT be discarded when determining address equality.

## Reads, writes and cleanup

setAddress MUST validate/decode human text before raw storage. setAddr accepts bounded bytes1..128. getAddr returns bytes or null; addr returns empty bytes if absent. resolveAddress MUST verify native domain identity and return only an explicit address record, never owner or another coin fallback.

Transfer/burn/reset MUST delete every indexed address, not only UI presets. Clearing-state failures MUST be reported and must never establish successful cleanup. Strong mutations can roll back their transaction; weak transfer/burn failure cannot undo the native token operation and requires reconciliation. See the open production gate in the review findings. No code claims a destination can receive a specific asset merely because its bytes decode.

## Compatibility and tests

SDK tests cover known vectors, tags, malformed lengths, missing semantics and legacy bytes. Live checks write/read XAH, XRP, BTC, ETH, SOL and TRX, then assert transfer/reset/burn cleanup. Additional coins need documented codecs and vectors before typed support.
