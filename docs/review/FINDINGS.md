# Current assurance findings

Reviewed: 2026-10-26. Scope: hook 0.3.0, SDK/UI verification paths, performance, tests and indexing. The [full follow-up audit](FULL-AUDIT-2026-10-24.md) recorded eight Medium findings (OCR2-01..08). All eight have implementation fixes and regression coverage; see [repair evidence](AUDIT-REPAIRS-2026-10-24.md). The refactor was subsequently installed on testnet and passed [P2 lifecycle and indexing verification](P2-TESTNET-2026-10-25.md). No new Critical/High vulnerability was confirmed; F-01 native assurance remains open.

## F-01 / P1 / IMPLEMENTED; PARTIAL NATIVE VERIFICATION: weak lifecycle reconciliation

The latest refactor is [installed and smoke-verified on testnet](TESTNET-AUDIT-DEPLOYMENT.md). This does not close the native fault-injection gate.

The candidate deployed to testnet on 2026-10-23 adds a durable cleanup journal and permissionless strong Invoke17 reconciliation, plus SDK/indexer quarantine and an explicit SDK recovery method. Production-WASM fault probes retain partial weak writes and exercise repair/replay. This is source/model evidence, not native-ledger fault-injection proof. The installed testnet hash set and SDK preset have been updated; native fault-injection proof remains open.

Required before production: controlled native failures at journal, primary/index/root/identity boundaries; inspect actual native outcome, committed HookState and strong recovery retry. Failed mint/refund settlement and pre-journal lost evidence remain operator cases. See [fix details and evidence](RECOVERY-AND-CLIENT-FIXES.md).

**Native follow-up, 2026-10-26:** [Isolated verification](P2-STANDALONE-2026-10-26.md) covers 31 selected native state_set errors across first claim, transfer and burn, partial weak persistence, SDK quarantine, failed strong repair with unchanged state, successful repair/retry and native indexer quarantine/recovery replay. Production issuance also handles duplicate-mint failure with one successful refund; a failed refund retains pending/correlation. Injection uses separately built test-only wrappers, not arbitrary engine/process faults. Expiry/stale callbacks, failed offer emission, failed-refund retry design, maximum native inventory and process/consensus crash remain open. This evidence does not authorize mainnet deployment.

**Refund diagnostics:** the SDK exposes tracked `refundTxHash` without extra registration-read RPC and an explicit `registrar.getRefundStatus()` for validated matching Payment receipts, bounded by the state snapshot. It distinguishes failed, paid-but-tracked, unvalidated and unknown outcomes; none authorizes payment retry. A [journal/strong-queue proposal](REFUND-RECOVERY-DESIGN.md) documents the double-payment boundary and migration requirements; no refund retry opcode is implemented.

[Native paid-tracking evidence](REFUND-DIAGNOSTICS-2026-10-26.md) now confirms a validated successful refund whose callback cleanup fails, leaving pending/correlation. SDK diagnosis returns paid with operator settlement required; additional ledger closes do not pay twice. The isolated run has 21 checks; only this cleanup-fault case replaces issuance with a guarded test-only copy. Production issuance remains close to its static instruction ceiling, so adding a journal requires resource planning.

## F-02 / P1 / FIXED in working tree: missing validation flag could pass a receipt

transactionResult rejected only validated:false, allowing an omitted flag to pass if acknowledgement metadata looked successful. It now requires validated:true. The new regression removes the flag and requires NOT_VALIDATED. Native offer submission already required true.

## F-03 / P2 / FIXED for public facade: owner/profile reads were not verified by default

Public client.getOwner/describe (and the deprecated owner resolve alias) formerly delegated to state-only defaults despite documentation describing verified identity. They now default verifyOwner:true and reject native/root mismatch. An explicit verifyOwner:false and low-level resolver default remain available for advanced state inspection and are documented as unverified. The mismatch regression covers public owner/profile methods.

## F-04 / P2 / IMPROVED: technical error strings and incomplete attribution

The UI exposed raw RC/engine messages. explainError now gives English messages, stage, action/recovery guidance, transaction hash and the actual failing handler from installed hashes. The requested handler is retained separately. Underpayment50 is distinguished from native insufficient-balance/fee/reserve failures. Weak failure with validated tesSUCCESS explicitly says the native operation is confirmed and needs recovery.

Raw technical text and hook executions stay in Activity. Unknown submission outcome never gets automatic retry guidance. Read-only native simulations verify insufficient payment, native owner reserve and low-fee rejection; the low-fee result now has a dedicated SDK explanation. These are bounded [P2 simulation cases](P2-TESTNET-2026-10-25.md), not exhaustive fee/reserve or consensus/fault coverage. Neither unit messages nor simulation establishes weak recovery.

## F-05 / policy / DOCUMENTED: successful overpayment has no change refund

The hook rejects underpayment but accepts a larger payment. The SDK sends the quoted price exactly. A raw caller paying more does not receive an automatic difference refund on success. Existing failure-refund logic is a separate path. Keep this policy explicit; decide separately whether a future version should require exact payment.

## F-06 / architecture / INITIAL IMPLEMENTATION: developer indexer and event API

The [indexer package](../../packages/indexer/README.md) provides a v1 metadata decoder, ordered full-ledger replay, SQLite projection/checkpoint/outbox, HTTP/SSE example and an optional SDK HTTP reader. The [P2 native run](P2-TESTNET-2026-10-25.md) verifies 19 owners at a pinned snapshot, 51-ledger/225-transaction replay, 71 persisted events and real subscription/reconnect, ending with an independent 88-entry state match. Shared network profiles cover testnet/mainnet transport while requiring a separate mainnet deployment. Production scalability, PostgreSQL, multi-version migration and complete native failure/recovery proof remain open. Public-RPC full-ledger bootstrap remains expensive. See [implementation evidence](INDEXER.md) and the earlier [events/indexing design](EVENTS-AND-INDEXING.md).
