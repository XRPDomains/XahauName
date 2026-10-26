# Refund diagnostics and paid-tracking verification

Date: 2026-10-26. Source baseline `b8a3309`. [Evidence](../../deployments/standalone-refund-read-validation.json), [read API](../READ-API.md#refund-diagnostics), [recovery proposal](REFUND-RECOVERY-DESIGN.md).

## Delivered

`RegistrationStatus.refundTxHash` exposes the existing 32-byte correlation without another receipt RPC. `registrar.getRefundStatus(name, options?)` explicitly reads a matching emitted Payment and its pinned validated ledger. It checks hash, treasury, original pending recipient/drops, full token InvoiceID, native Payment shape, sequence, flags and metadata. Mismatched/malformed replies fail closed. Receipt absence, unvalidated responses and outcomes after the state snapshot do not imply failure or payment. Pruned history remains unknown.

The result distinguishes `notTracked`, `unknown`, `unvalidated`, `failed` and `paid`. No current correlation is not proof of historical non-payment. A validated successful Payment with tracking still present is `paid`, with operator recovery required; it does not mean domain settlement completed. None of these states authorizes another payment. Missing pending recipient/amount prevents binding a receipt and stays unknown, even if an operator can investigate its transaction hash separately.

Existing registration/profile reads do not fetch transaction history or receipts. The explicit diagnostic adds one `tx` read and, for a validated receipt, one pinned ledger header. It has no signer dependency and never submits.

## Native evidence

The final isolated run passed **21 named checks and 26 signed transactions** on NetworkID 65535, node `2026.10.16-dev+4158` / commit `3dc41b2a5951855f7c5c88c9efed0299e7a843ec`. It first installs exact production bytes and repeats normal lifecycle and two emitted-failure cases. A new chain was needed because the previous WSL `/tmp` node data was no longer present; an initial connection preflight failed before any transaction.

| Case | Observed result |
| --- | --- |
| Duplicate mint, successful refund | One refund; buyer loses only parent fee; cleared correlation reports `notTracked` |
| Duplicate mint, recipient requires DestinationTag | Refund `tecDST_TAG_NEEDED`; pending/correlation retained; diagnostic `failed`, operator recovery |
| Successful refund, cleanup write fails | Payment validates `tesSUCCESS`; callback rejects20; pending/correlation retained; diagnostic `paid`, operator settlement |

The last case replaces only the isolated issuance hook with a **test-only copy**. It inserts one native `state_set` call with an invalid zero-length key immediately before refund cleanup. No production C or artifact is edited. Buyer balances prove exactly one refund, and additional ledger closes cause no second payment while tracking remains. This confirms why pending cannot safely authorize retry.

A broad wrapper around every state write initially failed the unchanged guard checker at **66,562 > 65,535** instructions and was not installed. Targeted instrumentation passed: **12,529 bytes**, hook count 32,192 and callback count 63,466. Production remains 12,512 bytes with callback count 63,466. This resource margin must be addressed before adding a payment journal to the production handler; checker limits and guards were unchanged.

## Verification and scope

Seven new deterministic tests bring the SDK suite to **115 PASS**. They cover the public method, validated failed/paid receipts, no extra registration RPCs, corrupt correlation lengths, incomplete tracking, missing/unvalidated/future receipts, field/amount/emission mismatches, alternate RPC receipt shape, invalid headers and propagated transport errors. Native receipts supplement these mocks.

SDK CommonJS/ESM and indexer builds pass; all **47 indexer tests** and application TypeScript checks pass. Schema, local links, signing-material scan and diff whitespace checks pass. The seven diagnostic tests were rerun after final malformed-response guards; the other 108 SDK cases passed in the full suite before that narrow guard addition.

The [recovery design](REFUND-RECOVERY-DESIGN.md) proposes a separate bounded payment journal and strong queue/retry/settlement transitions. It is a proposal only: refund retries, legacy-obligation migration, expiry/stale callback assurance and full native fault coverage remain open. No public testnet redeployment, mainnet operation, frontend production build, screenshot test or package publication occurred.

To reproduce the additional native scenario after starting the documented disposable node and building the SDK:

```powershell
$env:XAHAUNAME_STANDALONE='1'
node hook/test/prepare-native-faults.mjs --refund-cleanup
$env:STANDALONE_RUN='native-refund-settlement-new-run'
$env:STANDALONE_EMITS='1'
$env:STANDALONE_REFUND_SETTLEMENT='1'
Remove-Item Env:STANDALONE_FAULTS -ErrorAction SilentlyContinue
node hook/test/standalone.cjs
```

The builder refuses existing artifacts. Preserve its prior output before rebuilding. Use a fresh journal and stop the node after inspection. Raw receipts, failed instrumentation logs and test-only binaries stay under ignored `hook/build/current/`.
