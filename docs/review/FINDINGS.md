# Current assurance findings

Reviewed: 2026-10-23. Scope: installed hook 0.3.0, SDK/UI error and verification paths, tests and event/indexer feasibility. Hook C and deployed artifacts were not changed by this review.

## F-01 / P1 / OPEN: weak lifecycle failure needs native reconciliation

Claim and burn call hook_again from ctx0 and update domain state in ctx1/2. A weak rollback cannot undo an already applied native token transaction. Current model tests check that the C routine reports failure; they do not prove the native buy/burn was undone or demonstrate a complete recovery command.

Consequence: native owner/deletion and root/records may disagree after a weak failure. The SDK must refuse verified identity, avoid success messaging and surface recoveryRequired. This is an availability/consistency gap, even where native-owner authorization blocks stale-owner writes. Owner enumeration currently fails closed if it encounters inconsistent identity; a future recovery list should avoid hiding all healthy domains.

Required before production: controlled native-ledger fault injection at claim root/index/primary writes and burn cleanup deletes; inspect actual native outcome and committed HookState; implement and prove an idempotent repair/reconciliation path or revise the phase design. Test replay, unauthorized recovery and re-registration after failed burn cleanup. Do not weaken required cleanup semantics to hide the gap.

The [official strong/weak model](https://xahau.network/docs/hooks/concepts/weak-and-strong/) documents this rollback boundary. The protocol wording has been corrected; successful live happy paths remain valid evidence within that scope.

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
