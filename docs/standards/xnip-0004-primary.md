# XNIP-0004: Native primary names and verified ownership

- Status: Draft
- Version: 0.3.0
- Created: 2026-10-23
- Category: Resolution
- Depends on: XNIP-0000, XNIP-0001, XNIP-0003

## Primary identity

An account MAY select a domain it owns as its primary name. The hook stores primary_of:AccountID -> root key and sets the root primary bit. Replacing a selection MUST clear the old flag. Clearing an older selection MUST NOT erase a newer one. There is no owner profile lock.

`read.getName({address, name?})` and `getVerifiedPrimaryName(address)` MUST:

1. Pin one validated ledger and the configured treasury/namespace/network.
2. Match the account's primary reverse mapping to the canonical domain root.
3. Verify the root primary flag, root owner, canonical token identity/issuer and native owner against the account.
4. Return the canonical name only when primary selection and ownership agree. Missing selection returns null; inconsistent ownership or malformed state fails closed.

Receiving address records MUST NOT be required for primary identity. Missing or different XAH (21337), XRP (144), tagged or other receiving addresses do not invalidate an owned primary. `getAddress({name})` resolves the verified owner. With an explicit `coinType`, it reads only that receiving record and MUST NOT substitute the owner for an absent record.

## Scope and compatibility

This standard uses ownership-based primary identity. It differs from ENS forward-confirmed reverse resolution: selecting a primary does not assert that any payment record resolves back to the account. Applications displaying an account name SHOULD use the verified primary API; applications sending funds SHOULD resolve and show the intended receiving address separately.

There is no reverse registration for arbitrary BTC/ETH/SOL addresses, signatures by unrelated address owners or chain-wide default EVM names. This is not ENSIP-19 ABI compatibility.

Transfer, reset and burn MUST clear old primary references. Explicit unset does not affect other selected names. Indexer primary projections MUST use the same ownership and selection checks; indexed state is not current ledger proof.

## Evidence and security

Tests cover missing or different XAH receiving records, primary replacement, stale unset, native-owner mismatch and one-ledger reads. A text field or metadata name MUST NOT override verified identity. Snapshot integrity still depends on the selected RPC and deployment configuration.
