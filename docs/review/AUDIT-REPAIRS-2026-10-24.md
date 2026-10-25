# Audit repairs — 24 October 2026

This follows the [full source audit](FULL-AUDIT-2026-10-24.md). Changes are local candidates; deployment manifests continue to identify the installed hooks. No deployment, publication or mainnet transaction was performed.

**Deployment follow-up:** the candidate was subsequently installed on testnet at the maintainer's request. State preservation and smoke passed; see the [testnet deployment record](TESTNET-AUDIT-DEPLOYMENT.md). The statements below about deployment being unchanged describe the implementation repair phase. Mainnet assurance requirements remain open.

| Finding | Repair and focused evidence |
| --- | --- |
| OCR2-01 | Entry/byte-bounded LRU cache; expired eviction; TTL/budget zero stores no state. Controlled regression covers zero storage and repeated unique keys. |
| OCR2-02 | Cache generation changes on invalidation/signing-session changes; an old pending read cannot reinsert its result. Returned buffers remain isolated. |
| OCR2-03 | Deadlines/abort bound pending confirmation and registration RPC waits, with validated timeout arguments and late-rejection handling. Unknown confirmation retains its transaction hash. |
| OCR2-04 | Ledger overlays replace full-state clones. Reverse dependencies project affected names once unless recovery state changes. Owner/inbox/recovery collections have incremental indexes. Commit failure restores dependencies without mutating committed state. A one-domain update among 101 retained profiles calls `projectDomain` once; a getter trap rejects any full-state scan. |
| OCR2-05 | Complete ordered ledgers still validate, but unrelated receipts are omitted by default. `retainAllReceipts: true` opts into archival retention. Per-ledger transaction count and ordered hash digest remain as local replay evidence. A 100-unrelated-payment fixture retains zero receipts and advances its checkpoint. Idle sync reads a header. |
| OCR2-06 | Incoming discovery uses bounded verification, shared identities, immutable snapshot reuse and incremental history with gap rejection. Owned collections expose pinned cursors. Primary reads accept a candidate to avoid enumeration; initial discovery/history limits remain explicit. |
| OCR2-07 | Explicit selections bypass key discovery, deduplicate values and report partial completeness. Client-wide scheduling bounds RPC fan-out; `client.read` provides verified named-argument reads and sessions. |
| OCR2-08 | Activity retains at most 100 entries / approximately 128 KiB, summarizes oversized/cyclic details and deduplicates identical hash/phase entries; rendering still shows the latest 30. |

## Consolidation

- `protocol/schema.json` is the shared key/operation registry. `scripts/sync-protocol.mjs` verifies generated SDK constants and C key lengths, packed words and legacy/global profile bit maps. Existing wire IDs/orders remain unchanged.
- Six record/admin/profile handler entry gates now share one helper. Issuance, authorization and native lifecycle policies remain distinct. Removed obsolete unused C helpers and the misleading `has_role` wrapper; treasury checks use their actual name.
- Shared profile composition and paginated ownership verification avoid repeating SDK implementations. The app uses the new profile/quote facade, separates markup/history, shares HTML escaping and coalesces wallet refresh timers.
- SDK emits actual ESM modules alongside CJS, rather than a CJS wrapper. CI builds packages once and runs unit/package checks against those outputs. Removed the app's unused direct codec dependency.

## Hook validation

All ten candidate artifacts rebuilt with the pinned Docker toolchain and passed the native static guard checker. Sizes in bytes: issuance 12,512; set-address 3,830; authorization 3,524; set-text 5,623; clear-text 4,738; control 5,927; admin 3,158; claim 12,965; burn 13,382; profile 4,539. Maximum is below 64 KiB. No guard limits were raised. Production-WASM probe groups passed 168 lifecycle, 30 profile, 12 policy and 73 validation cases (283 total). Build source/hash/proof logs remain under ignored `hook/build/current`.

Compiler logs contain zero `warning:` diagnostics. SDK tests passed 107 cases plus the key/encoding checks; indexer tests passed 43 cases; app unit/integration fixtures passed 227 cases. Both package dry-runs, three release-tool regressions, TypeScript compilation, schema synchronization and repository/link/signing-material checks passed. The incoming-offer fixtures now provide actual root/pending state instead of replacing a method on an unscoped registrar instance, preserving their positive/negative assertions through the new scoped implementation.

Guard IDs depend on source lines, so the local artifacts differ from the installed hash set. The installed deployment manifest was deliberately preserved; any later redeployment must update and verify it through the deployment workflow.

## Remaining production assurance gate

F-01 remains **native validation open**. Durable journals, reconciliation and quarantine are implemented, and the production-WASM model retains partial weak writes in its fault probes. Those probes are not consensus-node fault injection. The available Docker environment contains the compiler image only, with no isolated Xahau fault-injection node running. Controlled failures at actual journal/primary/index/root/identity and emit/refund boundaries still need native-ledger evidence before mainnet readiness can be asserted.

The indexer still loads the materialized namespace into RAM. Incremental updates remove full-ledger copies/scans; they do not establish million-domain capacity. Bounded-memory persistent projection, large-scale heap/load benchmarks, retention/pruning policy and deployment-version migration remain separate architecture work. No automatic browser/screenshot tests or frontend production build were run.
