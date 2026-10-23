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
