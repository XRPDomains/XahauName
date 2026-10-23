# XNIP-0004: Native primary names and forward confirmation

- Status: Draft
- Version: 0.2.0
- Created: 2026-10-23
- Category: Resolution
- Depends on: XNIP-0000, XNIP-0001, XNIP-0003

## Candidate versus verified identity

The account owner MAY select a domain it owns as its primary candidate. The hook stores primary_of:AccountID -> root key and sets the root primary bit. Replacing a candidate MUST clear the old flag. Clearing an older selection MUST NOT erase a newer one. There is no owner profile lock.

getPrimaryName returns the configured candidate after consistency/native-owner checks. A reader displaying a verified receiving identity MUST instead implement getVerifiedPrimaryName:

1. Pin one validated ledger and the configured treasury/namespace/network.
2. Verify candidate, root primary flag/owner and canonical token issuer/native owner.
3. Read the explicit native XAH receiving record at coin type 21337.
4. Canonicalize supported address bytes, preserving tags, and compare to the account.
5. Return the canonical name only on a complete round trip; return null when absent or inconsistent. Malformed state/codecs fail closed.

The reader MUST NOT substitute root owner, XRP (144) or historical535 for an absent XAH record. Selecting primary does not create an address record implicitly. Apps SHOULD guide owners to set both.

## Scope and compatibility

The forward-confirmation principle follows [ENS reverse resolution](https://docs.ens.domains/ensip/3/) and [multichain primary names](https://docs.ens.domains/ensip/19/). This version is deliberately narrower: it requires domain ownership and native classic-account identity, with no reverse registration for arbitrary BTC/ETH/SOL addresses, signatures by unrelated address owners or chain-wide default EVM names. It is not ENSIP-19 ABI compatibility.

Transfer, reset and burn MUST clear old primary references. Explicit unset does not affect other selected names. Legacy candidate API remains available; application displays SHOULD label candidate versus verified identity accurately.

## Evidence and security

Tests cover primary replacement, stale unset, missing receiving record, mismatched address, legacy canonicalization, tags, unsupported coin fallback and one-ledger reads. Live test proves valid round trip, mismatch invalidation/restoration and cleanup after transfer. A text field or metadata name MUST NOT override verified identity. Snapshot integrity still depends on the selected RPC and deployment configuration.
