# Full source review

Date: 2026-10-23. Release candidate 0.3.0: development/testnet only.

Package-layout follow-up: SDK/indexer moved to `packages/`; source links below follow their current paths. The JSON coverage record preserves paths from the original reviewed snapshot. Workspace reorganization corrected the app README configuration description. Current fix status is tracked in the [follow-up](RECOVERY-AND-CLIENT-FIXES.md).

## Method and scope

Open Code Review's autonomous review could not start because no LLM endpoint was configured. Its **delegate** mode supplied deterministic file selection and rule resolution; the host performed code review and validation. This is not an independent external-model audit.

The full active tree was compared against the remote's README-only initial commit. OCR selected **118 files** and excluded **62** documentation, lock, asset, fixture and test files under its default filters. The [coverage record](open-code-review-coverage.json) accounts for every entry and the review/verification method. Coverage measures file accountability, not exhaustive execution-path coverage. Default-excluded application tests also ran; locks, fixtures and docs received additional integrity/link/secret checks. Third-party dependency source was outside the review.

## Findings

**Original review snapshot: 2 high, 2 medium; no critical finding identified.** The review itself changed no production source. Subsequent fixes implement all four; OCR-02/03/04 have regression coverage, and OCR-01 adds on-chain recovery with the native fault-injection release gate still open. See the [fix follow-up](RECOVERY-AND-CLIENT-FIXES.md).

### OCR-01 / High / existing: weak processing cannot guarantee native rollback

[claim.c:108](../../hook/src/handlers/claim.c) and [burn.c:73](../../hook/src/handlers/burn.c) schedule `hook_again()` and finalize ownership/cleanup in weak execution. A failed state write/delete cannot abort an already applied native buy/burn. Root/native ownership or cleanup can diverge. Model tests detect failures but do not establish native atomic recovery. This is existing F-01, not a new regression.

Required: native fault injection at claim/root/index/primary and burn cleanup boundaries, and an authorized idempotent recovery path or revised phase architecture. Quarantine/native-owner checks cannot repair state. See [official weak/strong semantics](https://xahau.network/docs/hooks/concepts/weak-and-strong/).

### OCR-02 / High / new: bootstrap can call unfinished registration claimed

[projection.ts:70–78](../../packages/indexer/src/projection.ts) promotes an existing root to claimed after root/native-owner verification without requiring pending state to be absent. Bootstrap has no preceding failed-execution metadata to establish quarantine. A matching root/native owner with leftover pending state can therefore appear in owned domains and verified-primary results while SDK registration status says recoveryRequired.

Offline reproduction: add a valid 32-byte pending record to the independent claimed fixture, bootstrap a fresh SQLite database, and compare indexer.describe with RegistrarModule.getRegistrationStatus. Actual results: **claimed / recoveryRequired**. No ledger writes or real signing.

Required: align projection with the SDK state machine, handle root+pending/refund/async contradictions before promotion, and add bootstrap/replay regression cases.

### OCR-03 / Medium / new: wallet-filled fees bypass SDK helper ceiling

[wallet-kit.ts:35](../../packages/sdk/src/wallet-kit.ts) checks maxFeeDrops only when the input already contains Fee. Normal SDK requests omit Fee and let the wallet fill it. The helper neither verifies the resulting fee before signing nor rejects an over-limit receipt when Fee was absent from input intent. The test app has an additional Wallet Kit preflight ceiling; that integration is protected separately.

Offline reproduction: Invoke without Fee, limit 1000000 drops, mock matching validated wallet receipt with Fee=2000000. The signer **accepts** it.

Required: enforce a pre-sign fee-preparation/preflight contract, or explicitly require provider-side enforcement and narrow the helper guarantee. Checking after validation cannot prevent a charge.

### OCR-04 / Medium / new: error guidance still assumes testnet

[diagnostics.ts:44–48](../../packages/sdk/src/diagnostics.ts) instructs users to add test XAH, fund Xahau Testnet or connect a Testnet wallet even when the shared configuration selects mainnet. The app README also still calls the runtime fixed-testnet. This sends configured mainnet users to the wrong network.

Required: network-neutral wording or active-network context, tests for both profiles, and matching app docs. The deliberately testnet-only deploy/live-test scripts should remain explicit.

## Validation

| Check | Result |
| --- | --- |
| Production-WASM model suites | 216 pass: lifecycle 101, profile 30, policy 12, validation 73 |
| Deployment masks | 1024 assertions pass |
| SDK | 71/71 pass |
| Indexer including SQLite rollback/restart and HTTP/SSE | 27/27 pass |
| Application | 129/129 pass |
| TypeScript and repository integrity checks | Pass |
| Additional isolated reproductions | Confirm OCR-02 and OCR-03 outside current passing suites |

No hook redeployment, frontend production build, package publication or live purchase was performed. Passing suites do not invalidate the reproduced findings. GitHub publication is a development-source snapshot, not approval for mainnet.

Close OCR-02 first. Specify wallet fee enforcement and remove testnet-only error guidance. Address OCR-01 in a dedicated protocol/recovery change with native-ledger evidence; do not weaken guard checking or substitute indexer assertions for on-chain recovery.
