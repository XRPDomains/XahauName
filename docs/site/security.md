# Security & trust

**Names, ownership, token mappings and records are on-chain.** The SDK, website and indexer make them accessible; none is an independent source of ownership.

## Who can do what

| Authority | Scope |
| --- | --- |
| Native token owner | Profile writes, primary selection, transfer offers and owner burn |
| Treasury | Hook upgrades, pricing, TLDs, pause, URI base, administrative registration and profile reset |
| Reconciliation caller | May request cleanup, but cannot choose the repaired owner; ledger custody and journal evidence decide |

Treasury upgrade authority can change the installed rules, including issuer-burn restrictions. On-chain execution does not imply immutable code or a fully trustless administrator. Check the [selected deployment](deployment.md) and installed hashes.

## Verify before authorizing

Match the network, treasury and namespace. Read the canonical domain mapping, native issuer/token identity and owner at one validated ledger. A root owner field alone is not enough. The [raw operations guide](hook.md) includes independent verification.

Confirm a domain recipient's owner again before signing a transfer. A payment address record is a different concept and may point elsewhere. Treat metadata, profile text and images as untrusted display content; escape them in HTML.

## Keep signing separate

Never collect seeds in a website or publish them in records. Recreate signers on account/network changes. Limit fees and preserve transaction intent. A lost wallet response may still represent a submitted transaction: check the receipt before retrying.

HookState and transaction history are public. Deleting a record does not erase it from historical ledgers. Keep secrets and sensitive personal data out of profiles.

## Availability and consistency

HTTPS/IPFS availability affects presentation, not ledger ownership. RPC responses still require a trustworthy node; using the SDK is not a cryptographic proof of an arbitrary RPC response. For stronger operational control, use your own suitable node.

Strong execution can roll back the originating transaction; weak cleanup cannot undo native ownership already applied. Quarantine inconsistent state and use the [recovery guidance](errors.md). An indexer can lag; inspect its checkpoint and verify critical writes directly on-chain.
