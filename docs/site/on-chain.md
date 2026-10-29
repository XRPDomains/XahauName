# On-chain model

**The ledger is the source of truth for the name service.** Resolution does not depend on a private domain database or a metadata response.

## What lives on the ledger

| Data | On-chain representation |
| --- | --- |
| Ownership | Native URIToken Owner, checked against the domain root |
| Domain identity | Canonical domain, forward token mapping and reverse-name mappings |
| Profile | HookState text records, including indexed custom keys |
| Receiving addresses | HookState records keyed by domain and coin type |
| Primary name | Reverse selection and the domain's primary state |
| Registration progress | Pending records and emitted-transaction correlation |
| Protocol configuration | Hook definitions, namespace, pricing, TLD settings and URI base |

## What a URI means

The token URI is on-chain. An HTTPS JSON response, image or avatar file is hosted externally. An IPFS content reference is also stored on-chain; retrieving the referenced bytes still needs IPFS availability.

Metadata presents the identity. It cannot change the domain owner, transfer rights or resolver records. The stored domain-to-token mapping remains authoritative even when the URI base changes for future mints.

## How to verify

Use `client.read` to read a validated ledger and verify native token identity. A snapshot pins related calls to the same ledger. You can also inspect the treasury's HookState and the native URIToken through an explorer or your own RPC node.

An indexer is an optional projection of ledger data. Check its checkpoint and confirm critical ownership on the ledger before signing.

## Authority and failure boundaries

Owners authorize domain records and transfers. The current hook chain restricts burn to the native owner. Treasury retains protocol upgrade and administrative reset/configuration authority; an upgrade could change these rules. **On-chain does not mean immutable or free of administrative trust.**

Strong hook execution can reject a transaction. Weak execution runs after native application and cannot reverse it. If native ownership and domain state differ, the SDK reports a recovery condition; do not treat that domain as ready for normal writes.

See the [protocol specification](../SPEC.md) for exact authority and lifecycle rules, or [Hook & raw operations](hook.md) for independent verification steps.
