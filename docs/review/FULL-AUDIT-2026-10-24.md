# Full code audit — 24 October 2026

Revision: `0471f265419705c96f902ec8665b43a9f1077ba7`. Scope: production source, deployment/build scripts and configuration for the hook, SDK, indexer and domain manager. The working-tree read-performance proposal was consulted as context. This audit changes documentation only; implementation fixes are deferred.

**Follow-up:** all eight findings now have local implementation repairs and regression evidence. The findings below describe the audited baseline; see [repair status and remaining native assurance gate](AUDIT-REPAIRS-2026-10-24.md) for the candidate changes. No redeployment was performed.

## Method and coverage

Open Code Review full-file preview selected95 files after explicit exclusions. Its delegate rules supplied the review checklists; the host reviewed source and cross-component behavior and ran focused offline reproductions. This is **not an independent external-model/security audit**. No configured external LLM was invoked.

All95 selected files are accounted for; zero selected files were skipped. The122 exclusions include docs, lockfiles, fixtures, assets, private environment files and test harnesses. Selected tests were consulted and executed as supplementary evidence, not counted as a full-file audit of every test. Dependency source and Docker/OS vulnerability analysis were outside scope. Coverage counts are file accountability, not proof of exhaustive path coverage. The [machine-readable report](full-audit-2026-10-24.json) includes per-file coverage, exclusions and structured findings.

No Critical or new High vulnerability was confirmed. There are **eight Medium findings** across cache correctness, memory, timeouts and scalability. Several were previously noted as design/performance limits; this report distinguishes them from newly reproduced behavior. The existing High native weak-failure assurance gate remains open. No browser, screenshot, live signing, deployment, frontend build, commit or push ran.

## High — existing production assurance gate

**F-01: native weak-phase recovery still needs controlled ledger fault injection.** The durable journal, strong reconcile command, owner authorization and quarantine reduce risk and have production-WASM model coverage. They do not establish how every interrupted weak callback/write behaves on the native ledger. Failures before/after journal creation, primary/custom/index/root/mapping deletion, emission/refund settlement and reconciliation retry still need controlled native evidence before a production-readiness claim. Weak rollback cannot reverse a native transaction already applied. This is not a newly discovered ownership bypass. See [current findings](FINDINGS.md), [recovery follow-up](RECOVERY-AND-CLIENT-FIXES.md) and [Xahau execution semantics](https://xahau.network/docs/hooks/concepts/weak-and-strong/).

The retained native burnable flag and treasury upgrade/reset authority remain documented policy boundaries. Owner-only burn is enforced by the installed chain; this audit does not claim immutable native issuer-permission revocation.

## Medium findings

### OCR2-01 — SDK cache retains expired entries without a bound

Location: [index.ts](../../packages/sdk/src/index.ts), state-cache declaration and readState insertion around lines50/232.

Every non-bypass read inserts a key even when cacheTtlMs is zero. Expiration prevents a cache hit but does not remove entries; distinct state keys and pinned ledger hashes accumulate until clearCache/disconnect. Long-running services and sessions reading many names can retain substantial obsolete data.

**Evidence:** mocked readState calls with2000 unique keys and TTL0 left2000 entries, all expired. This does not mean a short-lived app necessarily leaks indefinitely: explicit cache clears reset it.

**Fix:** skip insertion at TTL0; add configurable item/byte budgets, expiry eviction and bounded immutable snapshot caching. Preserve independent cloned buffers and negative-cache semantics.

### OCR2-02 — in-flight reads can undo cache invalidation

Location: [index.ts](../../packages/sdk/src/index.ts), readState/clearCache around lines232–237.

A read can begin before a confirmed write or signer switch, await its RPC, and insert its older moving-validated result after clearCache. That result can then be served for the configured TTL. Public pinned snapshot reads have distinct hash keys; the observed race concerns cache population and particularly the unpinned/raw read APIs.

**Evidence:** pause a read, call clearCache, then release the old RPC response: the cleared map contains one entry again.

**Fix:** capture a cache generation at request start, increment it on invalidation and only populate while generations match. Apply the same rule to any new read facade; do not invalidate another consumer's immutable in-flight request indiscriminately.

### OCR2-03 — confirmation timeout is not a hard deadline

Location: [confirmation.ts](../../packages/sdk/src/confirmation.ts), awaited tx request at line8.

waitValidated checks its timeout around each awaited request. A request that stalls can exceed the caller's overall timeout; the UI remains busy awaiting it. A concrete transport may eventually time out independently, but that timeout can exceed the caller's requested budget.

**Evidence:** a never-resolving request left timeoutMs5 unsettled after40ms. This controlled test establishes missing deadline enforcement, not that the real WebSocket has no timeout.

**Fix:** bound each read by the remaining deadline, validate timing options and support cancellation. Preserve the known transaction hash and unknown-outcome/no-resubmission behavior. Apply remaining-deadline discipline to offer polling as well; cancellation of a caller must not cancel a shared request still needed elsewhere.

### OCR2-04 — indexer work grows with all domains on each relevant update

Location: [index.ts](../../packages/indexer/src/index.ts), full state clone at line61 and all-name projection loop at line81.

Every ledger clones the full materialized namespace/token/profile state, even with no domain change. For a relevant receipt the indexer copies all profiles and projects every known domain twice. Address and text reads inside projection are local, so this is CPU/allocation work rather than an additional on-chain RPC for every field. The in-memory owner/primary queries also scan the collection.

**Evidence:** a valid100-domain snapshot followed by one profile update called projectDomain200 times. Source tracing additionally shows the per-ledger full clone.

**Fix:** retain key/token/owner-to-domain dependencies and update affected domains only. Use copy-on-write changes or bounded database-backed projections and indexed owner/offer/primary queries. Keep old-owner primary cleanup and quarantine/reconciliation dependencies complete. This is a quantified existing scale limitation, not evidence that SQLite itself is unsuitable for every installation.

### OCR2-05 — indexer permanently stores unrelated full-chain receipts

Location: [index.ts](../../packages/indexer/src/index.ts), commit at line118; [storage.ts](../../packages/indexer/src/storage.ts), raw receipt insertion at line47.

applyLedger correctly decodes the complete ordered ledger but passes every receipt to storage. SQLite stores all of them indefinitely, including ordinary traffic that produces no domain change/event. Storage/write load therefore follows the network's traffic rather than this service's activity. The sync loop also rereads the saved anchor as a full expanded ledger, adding avoidable transport work.

**Evidence:**100 unrelated successful Payments produced zero business events and100 persisted receipts.

**Fix:** separate complete-ledger validation from retention. Preserve relevant raw receipts, ledger/checkpoint/completeness evidence and event provenance; offer optional full archival retention with explicit compression/pruning policies. Validate the anchor with a header/hash rather than repeatedly fetching its full transaction bodies. Do not replace complete ordered replay with an account-only feed.

### OCR2-06 — collection reads repeat expensive discovery

Location: [registrar.ts](../../packages/sdk/src/registrar.ts), history paging at line244 and serial token verification at line268; [resolver.ts](../../packages/sdk/src/resolver.ts), owned-token enumeration/primary discovery at lines114/142.

Incoming offers rescan up to100 pages of account history on every refresh. Candidate IDs are then verified serially, and the same native identity may be reread by getRegistrationStatus because discovery is not wrapped in one operation-local snapshot context. Primary lookup separately enumerates owned tokens to find the domain corresponding to the reverse root hash. The implementation has page limits, but one SDK call can still perform very large amounts of work and old/pruned history can be incomplete.

**Fix:** expose paginated/incremental collection APIs with completeness metadata, bounded candidate concurrency and shared pinned identity/native-token results. Reuse portfolio results in one view. Support explicit indexer-backed discovery while verifying current ownership/receiving identity on-chain when required. Keep provider-history limitations visible rather than presenting an empty partial inbox as a proof that no offers exist.

### OCR2-07 — selective reads overfetch and value reads lack a shared limit

Location: [resolver.ts](../../packages/sdk/src/resolver.ts), describeSnapshot around lines224–239.

Even explicitly selected address/text lists trigger index/custom-descriptor enumeration. Record values then run through an unrestricted Promise.all; caller-provided lists are not limited to the on-chain15+15 inventory. Existing mapReads bounds descriptor and portfolio work, not the whole read operation.

**Fix:** add a verified getRecords/read-session planner that can avoid enumeration for explicit selections, deduplicate keys and bound aggregate read concurrency. A complete profile should still enumerate discoverable custom keys. Preserve missing-value/error distinctions and accurately label partial selections. See the [read API proposal](SDK-RPC-AUDIT.md#read-api-and-performance-follow-up--2026-10-24).

### OCR2-08 — UI Activity keeps all receipt details in memory

Location: [app.ts](../../test-app/src/app.ts), log at line43.

The Activity view renders only30 items, but activity.unshift retains all entries and their details for the whole page session. Receipt metadata and duplicate submitted/confirmed/read-error entries can consume much more memory than visible history suggests.

**Evidence:** invoking the actual transpiled log function1000 times with mocked DOM sinks retained1000 activity objects; the render limit remained30. No browser was used.

**Fix:** bound retained history by both entry count and approximate bytes, keep compact transaction summaries, deduplicate transaction phases and load full metadata by hash on demand.

## Consolidation recommendations

These are valuable refactors, not additional confirmed security vulnerabilities:

- **One frozen protocol schema.** Global/text key orders appear in C sweep strings/lengths/word tables, C profile bit maps, SDK constants/protocol/resolver lists and UI presets. Generate or verify these from a versioned source of truth while retaining both profile-v1 and v2 wire layouts. Never reorder deployed IDs to make arrays look tidy.
- **One hook entry-validation helper.** Repeated Payment/Invoke/ctx/version/op/sender scaffolding should be centralized without flattening distinct handler policies. Preserve chain-wide strong rollback and later authorization. Do not collapse the10 artifacts into one large hook merely to reduce source duplication.
- **Remove or isolate obsolete internal helpers.** Uncalled str_eq_lit, make_role_key, parse_hex_var_field, payment_is_partial, old emit_uritoken_mint_and_offer/emit_refund wrappers and finalize_claim remain in common.h. has_role now means treasury owner only. Retire misleading internals after reference checks; keep exported SDK compatibility aliases separately deprecated. Dead-code removal is primarily a source-maintenance improvement because the compiler already strips unused functions. Source line changes can alter line-derived guard IDs and artifact hashes, so rebuild/verify all affected artifacts.
- **A single readonly public facade.** resolve currently means owner, getAddr/addr expose bytes with different absent-value conventions, primaryOf returns a hash, getPrimaryName is configured/owned while getVerifiedPrimaryName adds forward confirmation, and describe/getProfileSnapshot return different shapes. Add the proposed object-argument facade and a documented raw API; preserve current semantics during migration. Do not redefine a receiving address as the owner.
- **Split app orchestration from rendering.** app.ts combines page markup, wallet/session lifecycle, notifications, history, profile actions, discovery and metadata. Share its duplicate HTML escaping with views.ts. Coalesce queued syncWallet refreshes and add dispose/cancellation hooks before turning it into an embeddable component. Existing raw/provider error traces should remain accessible behind compact summaries.
- **Avoid redundant packaging/build work.** CI rebuilds the SDK through sdk:test, indexer:test and release:check. Build each package once per validation phase and run the intended tests against that artifact. The SDK's ESM entry currently wraps the complete CommonJS entry, limiting effective tree-shaking; a future true ESM/public-read entry would improve browser integration. The test app's direct address-encoder dependency is unused by its source, which reexports SDK codecs.

## Verification and limits

| Evidence | Result |
| --- | --- |
| Targeted SDK receipt/owner/signing/recovery/refund/fee cases |18 passed |
| Wallet signer and expiry tests |31 passed; mocked wallets/RPC, no live signing |
| Indexer projection/source/immutable receipt cases |37 passed |
| Earlier same-revision read-performance follow-up |14 passed; live read-only RPC samples documented separately |
| Cache/timeout/activity/indexer-growth reproductions | Reproduced the findings above with controlled inputs |
| Maximum URI/name production-WASM boundary probes | Valid181/182/186-byte URIs emitted; no overflow finding confirmed |
| Existing production hook artifacts | All10 source hashes, WASM hashes, deployment manifest and guardPassed evidence agree; no rebuild needed for unchanged source |
| npm audit --omit=dev |0 advisories reported by the registry at audit time; root production dependency graph only |

Package type compilation was used for the indexer. Generated evidence stays under ignored hook/build/current. Native weak-failure injection, load/heap benchmarks at production scale, all-history replay and independent security review remain outside this evidence. Passing the selected tests does not negate the new edge-case findings.

## Grouped repair plan

1. **SDK correctness and read facade:** OCR2-01/02/03/07; one read planner, bounded generation-aware cache, deadlines/cancellation, consistent public API and compatibility aliases. Add focused regressions reproducing the observed failures; migrate app reads to the facade.
2. **Indexer read model and synchronization:** OCR2-04/05/06; incremental domain dependencies, relevant-receipt retention, indexed/paginated queries, shared collection discovery and ledger subscription as a wake-up signal with checkpoint replay/poll fallback. Versioned deployment/backfill remains an explicit feature.
3. **App maintenance and memory:** OCR2-08; bounded history, shared presentation helpers and coalesced wallet/session refreshes. Browser/screenshot checks run only on an explicit later request.
4. **Hook consolidation and release assurance:** remove unused internals, verify generated/frozen wire tables and entry policies, rebuild/check changed artifacts and perform the controlled native fault-injection gate. Audit the resulting diff before any requested redeployment. Keep human approval for publication/mainnet work.
