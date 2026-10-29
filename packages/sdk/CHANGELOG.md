# Changelog

## 0.3.1 — 2026-10-28

- Share primary-lookup snapshot reads and concurrent identical pinned object requests. Registration polling reads lifecycle state only when the validated ledger hash changes, while retrying failed reads and preserving submission safety.

- Deduplicate metadata requests per fetch transport, including custom proxies; retain successful metadata for five minutes and failed requests for five seconds. Incoming offers include the verified token URI for artwork without repeated ledger reads.

- Add `getProfileSnapshot()` to share profile, lifecycle and token reads; reuse verified avatar text and token URI for artwork. Deduplicate `describe()` reads per immutable snapshot and load custom-key descriptors with bounded concurrency.

- Recover one transient ledger read after reconnecting and verifying the deployment, including wrapped `UNKNOWN_ERROR` disconnects. Reconnect before signing when needed, never replay a submission, and retain transaction hashes on confirmation-read errors.

- Add same-ledger `getPortfolio()` and `checkDomain()` reads, bounded portfolio validation and operation-local snapshot deduplication. Portfolio summaries include verified token URIs for artwork without repeated domain reads.
- Add Kit-owned fee preparation, read-only transport retries and optional validated notifications; allow a signer to share an existing SDK connection. Offer polling tolerates transient RPC read failures without repeating a payment.
- Keep SDK fee estimation separate from Wallet Kit's sequence/flags/expiry preparation, and pass the signer's fee ceiling explicitly to the manager.
- Let Wallet Kit prepare expiry when the SDK only estimated fees; preserve explicit caller deadlines and verify them in validated receipts. Classify wallet verification failures separately from unknown errors.
- Allow configuring the WebSocket connection timeout (15 seconds by default), share concurrent connection attempts, and distinguish connection failures from transaction confirmation errors.
- Add explicit `registrar.reconcile(domain)` for Invoke17 recovery.
- Quarantine cleanup journals and finalized-root/registration-tracking contradictions.
- Prepare and cap wallet-filled fees before signing; request-only transports require explicit Fee, and receipt intent is immutable.
- Use network-neutral funding and wallet-connection diagnostics.

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
