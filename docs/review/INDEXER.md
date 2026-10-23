# Indexer implementation evidence

Date: 2026-10-23. Initial developer implementation; not published to npm and not deployed as a public service. No C changes or hook redeployment in this work.

## Delivered

- `@xahauname/indexer`: pure metadata decoder, complete expanded-ledger ordering, explicit pinned bootstrap, namespace filtering, known-hash gate, SQLite checkpoint/projection/raw-receipt/outbox transaction, replay and restart.
- Local read-only HTTP/SSE example with persistent event cursors and heartbeat/reconnect delivery.
- SDK `IndexerReadClient`, retaining indexer status and refusing another network's response.
- Shared SDK network/deployment resolver used by SDK/indexer/app, including signer, Wallet Kit balance, explorer and network labels. Mainnet transport preset exists; a real mainnet deployment is required separately.
- Quarantine on native/root inconsistency, failed weak processing and incomplete record cleanup; healthy domains remain queryable.

## Validation

Latest local checks: indexer 27/27, SDK 71/71, app 129/129; browser smoke 16 checks. TypeScript and repository link/signing-material checks pass. Hook C and installed artifact identities are unchanged.

Offline indexer tests use independently constructed binary root, record-index, custom-slot and keylet fixtures. They cover profiles, receiving addresses, custom texts, verified primary, pending/claim, native offers without HookExecutions, transfer/burn cleanup, native failure, weak failure, reserved mapping inconsistency, snapshot pagination/identity, unknown hashes, duplicate/shuffled deliveries, gaps, restart, database network isolation and SQLite transaction rollback. See `packages/indexer/test/`.

Two immutable public receipts are stored as fixtures, independently checked against expected transaction hashes/results and node counts:

| Operation | Transaction | Asserted namespace nodes |
| --- | --- | --- |
| Ten-field profile | `99A9DABFC79517777B74A032055298A129060F718A54195B076CBA63AE397867` | 11 |
| Native transfer claim | `EBFC6AD3CA45C7BA9CC4E055567594BE2A61860B65E309518C27B4516C07BAF9` | 20 |

The read-only live source check connected to NetworkID 21338 and decoded validated expanded ledger 13418244 with four transactions. This proves the current RPC response format and ordered metadata transport; it does not prove a complete live bootstrap/replay projection comparison. No transaction was signed or submitted.

## Open gates

The weak-phase on-chain recovery issue [F-01](FINDINGS.md) remains open. Quarantine is not an on-chain repair. Native fault injection and an idempotent authorized recovery path are still required before production.

SQLite tests and synthetic reconnect tests are not million-domain benchmarks or consensus crash tests. Runtime projection is resident in memory; PostgreSQL, bounded-memory projection, API load/outage tests, multi-version migration, failed/expired callback coverage and an independent pinned namespace/native-token comparison after live replay remain required for production claims.

The [earlier design](EVENTS-AND-INDEXING.md) remains a roadmap. V1 uses generic committed StateChanged and before/after DomainUpdated events alongside finalized native/domain lifecycle events. It does not claim every proposed granular event name or every production adapter is implemented.
