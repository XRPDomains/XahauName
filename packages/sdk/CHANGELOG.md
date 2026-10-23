# Changelog

## 0.3.0

- Shared testnet/mainnet network presets with explicit deployment identity and optional indexer HTTP reads retaining checkpoint/freshness information.

- Canonical ten-handler native protocol and verified testnet deployment configuration.
- Owner lock retired; native-owner authorization and Remit bypass rejection.
- Atomic profile-v2 batch for ten ENS Global Keys; profile-v1 wire compatibility retained.
- Named custom record discovery and full cleanup on transfer, reset and burn.
- SLIP-0044 XAH (21337), XRP (144) and SOL (501); no implicit legacy-ID migration.
- Explicit receiving-address codecs, verified primary lookup, IPFS content helpers and avatar resolution.
- Friendly English error explanations with actual hook attribution; strict validated receipts and native-verified public owner/profile reads.
- Wallet Kit signer with captured account/network, fee ceiling, validated receipt polling and transaction-intent checks.
- Public deployment identity, reproducible build configuration and versioned XNIP documentation.

Generic text writes remain bounded raw records. Optional typed SDK conventions do not imply full ENS ABI or multichain reverse-registration support.
