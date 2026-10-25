# SDK and Wallet Kit RPC audit

Date: 2026-10-23. Scope: current SDK and installed Wallet Kit 0.2.2. No hook deployment, production frontend build or package publishing.

## SDK changes

| Operation | Previous composition | Current | Measurement scope |
| --- | --- | --- | --- |
| Configured primary lookup | 9 RPCs | 7 RPCs | One owned primary domain, controlled ledger fixture |
| Forward-verified primary lookup | 15 RPCs | 9 RPCs | Same fixture plus the native XAH receiving record |
| Concurrent identical pinned object/state reads | One request per caller | One in-flight request | No completed-response reuse; independent cloned results |
| Offer/claim polling over unchanged validated heads | Full lifecycle scan every interval | One head read per interval; scan only on a new hash | Four head observations spanning two hashes perform two scans |

Public primary lookup methods now share one immutable context across enumeration, root, mapping and native ownership verification. The lower-level configured-primary lookup also shares its enumeration/root reads. Missing primary remains cheap: one head and one primary-state read. Wrong receiving addresses still return no verified primary; identity and recovery failures still propagate.

The client coalesces only concurrent `ledger_entry` and `account_objects` requests carrying the same explicit ledger hash and identical request arguments. Entries disappear on completion or failure. Moving-head reads, fees, queues, signing and submission are excluded. Different ledgers and clients never share requests. Returned objects/buffers cannot be mutated across callers.

Offer polling stores the hash only after a successful lifecycle read. Temporary read errors can therefore retry the same hash; wrong-network/recovery errors are not hidden. A new validated hash triggers a fresh lifecycle snapshot. Polling retains its deadline, cancellation and no-resubmission behavior. The buy/claim fixture now advances the ledger when emitted state appears rather than changing data inside one immutable ledger.

Profile, portfolio, quote, metadata and incoming-artwork behavior remain as recorded in [ledger read performance](READ-PERFORMANCE.md). Writes still require fresh price, offer and ownership checks. Clearing those checks or using cached indexer ownership as signing authority is outside this optimization.

## Wallet Kit measurements

The real manager, protocol and GemWallet/Xaman/Xyra adapters were exercised with mocked providers and RPC responses. Each measured warmed signing/confirmation path used the same nine RPCs:

```text
before wallet signing: server_info → account_info(queue=true) → fee(tx_blob)
after wallet signing:  server_info → account_info(queue=true) → fee(tx_blob)
before submit:         server_info → submit
SDK confirmation:      tx
```

This excludes domain-state reads, initial connection verification, native emission waiting, view refresh and additional polls when a transaction is not yet validated. The existing Kit-owned fee mode already reduces the older twelve-request integration to nine. Kit's separate confirmation and account-status services remain disabled in the app; SDK validated receipts populate Kit history.

The second preparation is intentional: `verifyProtocolTransaction()` calls protocol `prepare()` after verifying the signed blob. It rechecks queue-aware sequence, expiry and transaction-aware fee after the wallet approval delay. The installed protocol then reads the head again in `submit()`. This is not evidence of duplicate manager/adapter autofill, and the entire post-sign check must not be removed.

## Proposed Wallet Kit work

These proposals require a separate Kit implementation and tests; no installed package files were patched.

1. **Combine post-sign validation with immediate submission.** Introduce a protocol operation that checks the signed blob against intent, reads fresh head/queue/fee, then submits within that same controlled phase. Bind any internal validation context to the exact blob hash, account, network, fee ceiling and session generation. Never accept a caller-supplied validation flag, reuse pre-approval data, or reuse across requests. If signing/provider interaction resumes, the session changes or freshness expires, discard the context and revalidate. For the measured path, this could remove the extra pre-submit `server_info`: target **9 → 8 RPCs**, subject to validation. Retain a fresh head check for standalone submit paths.
2. **Parallelize independent reads.** Before signing, head and queue/account data can be fetched together; fee encoding follows field preparation. After signing, the expected serialized transaction is already known, so head, queue and fee reads can run together while retaining every check. The current path has nine sequential network waits; the combined design could reduce this to five phases (two preparation phases, one post-sign validation phase, submit, receipt), excluding provider time. This is a design estimate, not a measured Kit speedup.
3. **Coordinate confirmation readers.** Keep one receipt poller per network/hash when multiple SDK/Kit consumers ask for the same transaction. Share concurrent reads, not submissions; retain cancellation, uncertainty and exact validated-intent checks. Do not enable both the current Kit and SDK pollers without coordination.
4. **Expose diagnostics.** Optional request tracing with stage, method, elapsed time and logical request identity would make duplicate work visible without recording signed blobs or wallet credentials. Do not add provider getters solely for tracing; Xahau signing should retain the popup reduction in 0.2.2.

Acceptance cases include delayed approval across ledgers, changed queue/fee, expired or extended expiry, account/network switch, tampered blob, dropped submit response, rejected cancellation and concurrent signing. A final `tx` read cannot be replaced by preliminary `tesSUCCESS`.

## Evidence

- [SDK request/primary regressions](../../packages/sdk/test/read-performance.test.cjs)
- [Polling, recovery and no-resubmission tests](../../test-app/tests/rpc-recovery.test.ts)
- [Real Kit pipeline and per-adapter request trace](../../test-app/tests/wallet-kit-pipeline.test.ts)
- [Live readonly profile measurement](../../test-app/tests/profile-performance-browser.cjs)

Validation: 95 SDK tests and 225 application tests passed; application TypeScript checking passed. Signing tests are mocked provider/ledger acceptance, not live extension signing or native hook execution. No transactions were submitted.

The subsequent readonly browser profile sample passed with 13 ledger-data RPCs and zero duplicates on both loads. Elapsed time was 10227 ms with initial connection/verification and 5007 ms with the existing connection. The latter included one additional background RPC in the total (14), outside the 13 profile-data requests. Compared with earlier samples, wall-clock latency remains variable despite deduplication; these changes do not establish a stable public-endpoint speedup. On-demand connection browser checks also passed.

## Read API and performance follow-up — 2026-10-24

Read-only Node measurements used `wss://xahau-test.net`, domain `sdklive13386530.xah`, the installed deployment and `cacheTtlMs:0`. No browser, screenshots, transaction signing, deployment or frontend build ran. Initial connection was measured separately. Existing connection samples include ledger selection and identity verification but exclude HTTP metadata/images. Two samples per repeated operation are descriptive, not a percentile benchmark or an endpoint SLA. Other operations have one sample.

| Operation | RPCs | Elapsed milliseconds |
| --- | --- | --- |
| Initial connect and deployment verification | 2 | 2412 |
| Verified getOwner | 6 | 2612 / 2000 |
| getProfileSnapshot | 13 | 1813 / 2366 |
| describe with no addresses and avatar/description only | 9 | 4637 / 2145 |
| resolveAddress for native XAH | 7 | 4399 / 2331 |
| Concurrent independent owner/address/text calls | 9 | 2527 |
| Available-name quote | 12 | 734 |
| Portfolio of the sampled one-domain owner | 7 | 2752 |

Per-operation duplicate request signatures were zero except the independent owner/address/text composition, which issued the same validated-head request twice. Fewer requests did not consistently mean lower elapsed time because parallelism, dependency stages and public endpoint latency differ. Fourteen focused offline performance regressions also passed: full fixture profile composition29 to14 RPCs, configured primary9 to7 and verified primary15 to9, with identity/recovery checks retained.

### Findings and implementation priorities

1. **Plan one verified read operation.** `getOwner` currently reads root/recovery, then forward token identity, then native token and finally reverse identity. Independent reads can overlap while all results remain pinned to one validated hash. Start requested records alongside verification and expose values only after identity succeeds. Preserve missing-domain and recovery error semantics when doing speculative work. Measure dependency stages as well as request counts.
2. **Selective record reads.** `describeSnapshot` still enumerates the records index/custom descriptors when both requested address and text lists are explicit. A new `getRecords` operation should verify identity once and read only selected keys, without claiming complete custom-key enumeration. Existing full-profile enumeration must remain available. Avoid mixing raw getText values with a separately sampled owner.
3. **A reusable read snapshot.** Expose a supported scoped read session to combine owner, receiving addresses, text and content reads against one hash and shared promises. Concurrent independent public calls currently share only overlapping transport requests, not completed results or the validated-head lookup. Do not replace this with an unqualified moving-head TTL cache.
4. **Bound caches and request concurrency.** The state cache has expiration checks but no size bound or expired-entry eviction. Long-lived clients can retain expired keys across many ledger hashes until clearCache. Introduce a bounded LRU/expiry policy. Apply one configurable read scheduler to record values as well as custom descriptor/portfolio work; full-profile value reads currently use unbounded Promise.all. Keep cancellation local to a consumer when requests are shared.
5. **Primary lookup for large wallets.** Current primary-name discovery enumerates owned tokens to recover the name corresponding to the stored root hash. Its cost grows with the portfolio. Reuse portfolio results in a view, or use an indexer candidate and verify native identity plus the forward receiving address at the ledger. Do not treat the configured primary candidate as a verified identity.
6. **Indexer integration.** Use indexed profiles/portfolios for display with explicit checkpoint/freshness metadata; keep the ledger as the authority for signing and receiving-identity verification. The test app currently has no IndexerReadClient integration. Do not silently return indexed ownership as freshly verified on-chain ownership.

### Proposed public API (not implemented)

ENSjs is a useful model for named read actions, record selection and separation of public/wallet/indexing APIs; its EVM multicall implementation cannot be assumed to exist in Xahau. References: [ENSjs](https://github.com/ensdomains/ensjs), [text records](https://docs.ens.domains/web/records/), [forward-confirmed primary names](https://docs.ens.domains/web/reverse/).

| Proposed call | Meaning |
| --- | --- |
| getOwner({name}) | Verified native owner, distinct from a receiving address |
| getAddress({name, coinType: 21337}) | Decoded receiving address; no owner fallback |
| getText({name, key}) | One verified UTF-8 record or null |
| getRecords({name, addresses, texts, contentHash}) | Selected records, one shared snapshot/identity verification |
| getProfile({name}) | Complete discoverable profile with decoded addresses and custom texts |
| getName({address}) | Forward-confirmed primary name or null |
| getDomain({name}) | Identity and registration/claim/recovery status |
| getQuote({name}) | Price and purchase availability/configuration at one snapshot |
| getNames({address, cursor, limit}) | Paginated domain listing; support explicit ledger/indexer sources |

Use object arguments consistently; expose human-readable addresses in the public facade and retain bytes/state keys under a documented raw API. Treat absent records as null and preserve typed failures for malformed state, identity/recovery, codec or RPC problems. A raw reverse record should have an explicit name such as getReverseRecord. Normalization must follow this protocol's ASCII rules, not ENS Unicode rules; do not silently remove internal whitespace or append a TLD in low-level reads.

Rich results should identify source, ledger hash/index and completeness. A scoped snapshot can expose that metadata once for multiple simple-value calls. Do not label a partial selection as a complete profile. Avatar/profile results should distinguish on-chain avatar records from display-only token metadata fallback.

Add this facade without changing the semantics of existing calls: current resolve means owner, getAddr/addr expose bytes with different missing-value conventions, describe returns FullProfile, and getProfileSnapshot wraps profile plus lifecycle/token data. Keep deprecated aliases through a compatibility window, document replacements and migrate the app to the facade. These recommendations require SDK work and targeted tests; no hook change or redeployment is needed for this first phase.

Implemented follow-up: [verified read API](../READ-API.md) documents `client.read`, sessions, record selections, cursors and budgets. The app now uses its profile and quote reads. [Repair evidence](AUDIT-REPAIRS-2026-10-24.md) records the cache, deadline, discovery and indexer changes and their verification limits. Initial history discovery and legacy full-list APIs still have documented limits; the separate indexer HTTP client remains an explicit data source.
