# Current assurance findings

Reviewed: 2026-10-23. Scope: installed hook 0.3.0, SDK/UI error and verification paths, tests and event/indexer feasibility. Hook C and deployed artifacts were not changed by this review.

## F-01 / P1 / IMPLEMENTED; NATIVE VALIDATION OPEN: weak lifecycle reconciliation

The candidate deployed to testnet on 2026-10-23 adds a durable cleanup journal and permissionless strong Invoke17 reconciliation, plus SDK/indexer quarantine and an explicit SDK recovery method. Production-WASM fault probes retain partial weak writes and exercise repair/replay. This is source/model evidence, not native-ledger fault-injection proof. The installed testnet hash set and SDK preset have been updated; native fault-injection proof remains open.

Required before production: controlled native failures at journal, primary/index/root/identity boundaries; inspect actual native outcome, committed HookState and strong recovery retry. Failed mint/refund settlement and pre-journal lost evidence remain operator cases. See [fix details and evidence](RECOVERY-AND-CLIENT-FIXES.md).

## F-02 / P1 / FIXED in working tree: missing validation flag could pass a receipt

transactionResult rejected only validated:false, allowing an omitted flag to pass if acknowledgement metadata looked successful. It now requires validated:true. The new regression removes the flag and requires NOT_VALIDATED. Native offer submission already required true.

## F-03 / P2 / FIXED for public facade: owner/profile reads were not verified by default

Public client.getOwner/describe (and the deprecated owner resolve alias) formerly delegated to state-only defaults despite documentation describing verified identity. They now default verifyOwner:true and reject native/root mismatch. An explicit verifyOwner:false and low-level resolver default remain available for advanced state inspection and are documented as unverified. The mismatch regression covers public owner/profile methods.

## F-04 / P2 / IMPROVED: technical error strings and incomplete attribution

The UI exposed raw RC/engine messages. explainError now gives English messages, stage, action/recovery guidance, transaction hash and the actual failing handler from installed hashes. The requested handler is retained separately. Underpayment50 is distinguished from native insufficient-balance/fee/reserve failures. Weak failure with validated tesSUCCESS explicitly says the native operation is confirmed and needs recovery.

Raw technical text and hook executions stay in Activity. Unknown submission outcome never gets automatic retry guidance. Read-only native simulation now verifies tecUNFUNDED_PAYMENT with eight provisional hook executions and zero committed HookState nodes. Fee/reserve boundaries and consensus/fault fixtures are still required; neither unit messages nor simulation establishes weak recovery.

## F-05 / policy / DOCUMENTED: successful overpayment has no change refund

The hook rejects underpayment but accepts a larger payment. The SDK sends the quoted price exactly. A raw caller paying more does not receive an automatic difference refund on success. Existing failure-refund logic is a separate path. Keep this policy explicit; decide separately whether a future version should require exact payment.

## F-06 / architecture / INITIAL IMPLEMENTATION: developer indexer and event API

Validated WebSocket transport, seven representative treasury-history transactions, four autonomous mint/offer transactions and 51 HookState ledger-index/account/namespace matches were verified read-only. The [indexer package](../../packages/indexer/README.md) now provides a v1 metadata decoder, ordered full-ledger replay, SQLite projection/checkpoint/outbox, HTTP/SSE example and an optional SDK HTTP reader. Shared network profiles cover testnet/mainnet transport while requiring a separate mainnet deployment. Independent fixtures and immutable testnet receipts exercise the decoder. Production scalability, PostgreSQL, multi-version migration and complete native failure/recovery proof remain open. See [implementation evidence](INDEXER.md) and the earlier [events/indexing design](EVENTS-AND-INDEXING.md).
