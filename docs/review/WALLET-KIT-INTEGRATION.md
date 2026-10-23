# Wallet Kit integration review

Date: 2026-10-23. Scope: SDK signer integration and installed Wallet Kit 0.2.1. No hook changes or deployment.

## Findings and changes

The direct SDK wallet signer uses one Xahau autofill/sign/submit flow. The Kit integration previously forwarded a fully autofilled transaction to a manager that also prepares transactions. This accidentally promoted SDK-generated signing fields to explicit caller requirements.

| Finding | Evidence | Change |
| --- | --- | --- |
| Generated expiry treated as an explicit deadline | Reproduced `SIGN_FAILED: Xahau verification failed: Signed fields changed: LastLedgerSequence` with the real Kit verifier | Forward caller intent and checked Fee; let Kit prepare a missing expiry and enforce its extension/window policy |
| Generated sequence conflicts with queue-aware preparation | Reproduced `Prepared Sequence is stale` with the real manager and GemWallet adapter when two transactions were queued | Let Kit select a missing sequence from current account and queue data |
| Generated flags override Kit defaults | The real Xahau Client adds `Flags: 0` during fee estimation | Keep generated signing metadata out of the request; preserve explicit caller flags |
| Fee ceiling depended on manager configuration as well as SDK checks | The signer did not pass its own ceiling in the manager request | Pass `maxFeeDrops` explicitly; retain pre-sign fee and validated receipt checks |
| Kit rejection/network codes could fall through to generic diagnostics | Installed core uses `SIGN_REJECTED`, `CONNECTION_REJECTED`, `NETWORK_MISMATCH` and `NETWORK_NOT_SUPPORTED` | Classify these as wallet-stage failures |

Explicit caller Sequence, Flags and LastLedgerSequence remain exact. No verifier is disabled, no adapter code is patched and no failed transaction is automatically retried.

## Automated coverage

[Pipeline tests](../../test-app/tests/wallet-kit-pipeline.test.ts) compare direct SDK signing against the real WalletManager and installed GemWallet, Xaman and Xyra adapters. They use the real Xahau Client autofill, serialization, signing and Kit signature/intent verification. Provider transports, domain-read state and ledger responses are fixtures; hook acknowledgements are simulated.

The comparison covers buy, claim, setText, setProfile, setAddr, clearAddr, clearText, setPrimary, reset, create/cancel transfer offer, accept transfer and burn. Additional cases cover queue-aware sequence selection, explicit signing fields, mutated payment rejection, fee-ceiling propagation and sequential purchase/claim approvals.

[Expiry tests](../../test-app/tests/wallet-expiry.test.ts) additionally cover bounded extensions, expiry-window enforcement and unauthorized changes to payment fields. [Signer tests](../../test-app/tests/wallet-signer.test.ts) cover fee estimation, session changes and receipt substitution.

Validation: 45 pipeline comparisons/regressions passed (13 operations across three adapters, plus six edge cases), 207 application tests passed, 81 SDK tests passed, application TypeScript checking passed and repository checks passed. Pipeline results cover simulated native receipts; they do not claim live on-chain execution.

## RPC latency and interrupted purchase follow-up

The domain manager now selects `feePreparation: 'wallet-kit'`, retaining an explicit manager fee ceiling and validating the actual receipt fee. In the warmed signing/confirmation fixture, this removes three duplicate autofill reads: 12 RPC requests become 9. Those counts exclude domain-state reads, offer polling and initial connection verification; they are not a claim that a complete registration needs only nine requests.

The app shares one connected SDK client between reads and signing, disables duplicate Kit confirmation/account-status lookups, and updates Kit history from the SDK's validated callback. The Kit still checks network identity and ledger freshness before/after signing and before submit. One transient Kit read may be retried; submission is never retried automatically.

Offer polling tolerates temporary transport failures within its existing deadline. A persistent failure keeps the confirmed purchase pending for later claim. After a confirmed write, a profile-view refresh failure is recorded separately and does not turn the transaction into a failed action. Hidden portfolio/history refreshes are omitted from the purchase success path.

A readonly sample from the configured public endpoint measured a 2.404-second connection and individual requests of 362, 1045, 406 and 910 ms. This is a point-in-time observation, not an availability guarantee. Multiple sequential RPC reads, wallet approval and native ledger/emission confirmation all contribute to elapsed time.

Follow-up validation: 214 application tests, 81 SDK tests and application type checking passed. The pipeline suite now includes the request-count regression. Transient/persistent offer-read failures, bounded read retry, no submit retry and signer attachment without reconnecting have dedicated coverage.

## Wallet Kit 0.2.2 compatibility check

On 2026-10-23, the application dependency was pinned to `@xrpl-wallet-kit/client@0.2.2`, with core, UI, Xahau protocol and bundled adapters resolved to 0.2.2 in the workspace lockfile. No integration changes were needed for this upgrade.

Validation against the installed 0.2.2 packages: 215 application tests and 90 SDK tests passed, along with TypeScript checking, browser smoke, on-demand connection browser regressions and repository integrity checks. The browser exercised the wallet modal and a readonly balance fixture. Signing tests used real manager/adapter implementations with mocked provider transports and ledger responses; no live wallet signing or ledger writes were performed. No frontend production build or hook deployment was run.

## Acceptance boundary

### Application styling follow-up

Removed legacy application CSS that forced the button balance onto a separate line, expanded its label and made the mobile wallet control full width. Wallet Kit now controls its own compact balance and narrow-button behavior. A dedicated [browser check](../../test-app/tests/wallet-kit-ui-browser.cjs) verifies compact display, retention during a delayed refresh, hiding on a narrow button, balance visibility in the account panel and absence of the old button network badge. The existing browser smoke and TypeScript checks also pass. GemWallet popup reduction comes from the installed Xahau adapter signing path; live extension prompt counts remain unverified.

### Disconnected-ledger recovery

The reported `UNKNOWN_ERROR: You need to be connected to a ledger` was missing from transient transport classification. It now receives a short connection message when no submission is known, while known hashes and uncertain provider outcomes retain confirmation guidance. SDK reads may reconnect, verify the configured network and hook deployment, and retry once with the original pinned ledger. Connection verification itself uses a direct request to avoid recursive recovery. A disconnected write connects before signing; the submission is never replayed. The app confirmation transport reconnects on demand, and non-transient confirmation failures retain the submitted hash.

Mocked regressions cover concurrent recovery, bounded retry, deployment mismatch, read-only Kit retry, single signing attempt and confirmation hash retention. The 90 SDK tests, application suite and on-demand connection browser check passed. This does not establish public RPC availability or reproduce the user's live wallet session.

These tests establish the integration contract, not live wallet acceptance or native hook behavior. Extension/mobile UI, Xyra popup activation and provider-specific field rewriting still need live checks. No real payment or ledger write is submitted by these tests. Existing native deployment evidence remains separate.

The development app imports SDK source through Vite. Reloading the app picks up these changes; a hook redeploy or frontend production build is unnecessary for local testing.
