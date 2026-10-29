# XahauName

Readable names for Xahau wallets, profiles and applications. **Domain ownership, domain–token mappings, receiving addresses, text records and primary selections live on-chain.**

The SDK reads the ledger and prepares wallet-signed transactions. A website, metadata server or indexer does not grant ownership.

## What developers can build

- Resolve a domain's owner and a wallet's verified primary name.
- Publish profiles, multichain addresses and custom text records.
- Register, claim, transfer and burn domains through native transactions.
- Associate a domain with IPFS website content.

Start with the [SDK quickstart](quickstart.md), then choose [reads](read.md) or [writes](write.md).

## Why this design

| Strength | Practical trade-off |
| --- | --- |
| Identity and records can be read directly from Xahau | RPC availability and ledger history still affect access |
| Native URITokens represent ownership | Mint, offer and claim complete in separate stages |
| One atomic profile update can set several fields | Records have explicit on-chain size and count limits |
| Names have no expiry or renewal | This version does not support subdomains or leasing |

## Scope of this release

This is a developer-facing testnet release. Use test XAH and the configured testnet deployment. Mainnet requires a separate deployment and configuration.

The system is on-chain, but **not every dependency is immutable**: treasury controls upgrades and administrative settings; HTTPS metadata can change. Read the [on-chain model](on-chain.md) before integrating.
