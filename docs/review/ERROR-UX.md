# Error handling and user feedback

Reviewed: 2026-10-23. UI text remains English. SDK errors and Activity retain technical diagnostics. `explainError` is a presentation adapter, not a retry mechanism.

## Responsibility by stage

| Stage | Owner | Typical failure | User guidance |
| --- | --- | --- | --- |
| Input validation | SDK/UI | Invalid name/TLD/address/bounds | Correct the form before wallet approval |
| Consent/network | Wallet Kit/provider | Wrong account/network, decline, popup unavailable | Connect intended testnet wallet; preserve a paid purchase |
| Confirmation | RPC/signer | Disconnect, missing hash, timeout | Check history; never automatically repay |
| Native execution | Ledger | Insufficient amount/fee/reserve, missing offer | Explain available XAH and reserve; refresh status |
| Strong domain execution | Actual handler from HookHash | Price/name/owner/index/write rejection | Readable reason, code/hash in Activity |
| Mint emission | issuance | Reserve/details/fee/emit/correlation failure | Inspect payment and registration state |
| Mint/offer/refund callback | issuance cbak | Child failure/expiry, unavailable outcome | Exact stage and pending/recovery; no duplicate purchase |
| Weak finalization | claim/burn | Native applied but state processing failed | Operator recovery; do not claim native rollback |
| Indexed read | Future indexer | Lag/missing history/unverified projection | Expose checkpoint and fall back appropriately |

## Message intent

| Code/context | User-facing explanation |
| --- | --- |
| RC10/34/36 | Canonical name, whitespace or TLD rule |
| RC31/55 | Name unavailable/already pending; refresh, no duplicate payment |
| RC12/40 | Owner versus treasury permission |
| RC50 | Price changed/payment below price; separate from wallet balance |
| tecUNFUNDED_PAYMENT / terINSUF_FEE_B / tecINSUFFICIENT_RESERVE | Available XAH must cover action, fee and reserve |
| RC62 | Fifteen addresses and fifteen total texts; clear before adding |
| RC60 with mint/offer/refund trace | Inspect exact stage and pending/refund |
| NOT_VALIDATED/TIMEOUT | Confirmation unknown, not a confirmed failure |
| tesSUCCESS plus weak claim/burn error | Native transaction confirmed; domain needs recovery |
| OWNERSHIP_MISMATCH / CLAIM_NOT_FINALIZED | No verified identity/completion; preserve txHash |

The actual rejecting hook may differ from the requested handler. Save profile targets `profile`, but `authorization` can reject first. Activity records handler, requestedHandler, hookHash, stage, engineResult, code, txHash and raw HookExecutions. A native fee/reserve error must not invent a hook attribution.

## Changes and evidence

- Receipts require `validated:true`; omitted validation cannot establish success.
- Public client.getOwner/describe (and the deprecated owner resolve alias) default to native verification. Explicit unverified and low-level reads remain documented.
- UI catch/form paths use explainError instead of raw RC strings. Refund/recovery after purchase shows a warning rather than a completed-claim message; purchase hashes remain in Activity.
- Tests cover funds/fee/reserve wording, price distinction, actual hook attribution, emission stages, wallet decline, uncertainty, weak recovery and nested post-claim hash preservation.

## Application toast presentation

The application presents operation progress and outcomes in one compact bottom-right toast. Wallet Kit transaction toasts are disabled to avoid duplicate feedback; SDK confirmation and Kit transaction history remain enabled as before. The app uses blue waiting/spinner, green success, amber attention and red error, with text/icons and accessible status/alert roles. Success fades away after five seconds; warnings and errors remain dismissible. Phase changes and dismissal use a 180ms fade, while reduced-motion preferences apply updates immediately. Rapid updates cancel obsolete transitions, and action cleanup cannot remove a pending success state. Form errors retain inline guidance. Notification dismissal never cancels or retries a transaction.

When a native dialog is open, the notification is mounted in that dialog's subtree so it remains visible and dismissible. Closing the dialog returns the notification to the page. Browser coverage verifies bottom-right placement at 320–1440px, disabled Kit toast mounting, distinct tones, fade/auto-dismiss, persistent warnings, rapid updates, reduced motion, modal visibility and dismissal. Long messages remain scrollable on short screens. No wallet transaction is sent by these presentation tests.

## Remaining work

A real RPC simulation of an over-balance purchase returned tecUNFUNDED_PAYMENT and the friendly funds explanation, with no broadcast. Fee/reserve and consensus boundaries still need fixtures. Total balance is not a precise spendable/reserve estimate; there is no complete pre-sign reserve/fee breakdown yet. Simulation cannot guarantee later success after balance, fee load or offer changes.

Actual provider consent/popups/mobile behavior and recovery UX require manual acceptance. Weak finalization requires the reconciliation work in [findings](FINDINGS.md), beyond warning text.
