# Ledger read performance

Date: 2026-10-23. Scope: SDK reads and domain-manager loading. No hook changes or deployment.

## Observations

Readonly measurements against the configured public endpoint, with the SDK state TTL disabled:

| Operation | Elapsed | RPC count | Exact duplicate requests |
| --- | --- | --- | --- |
| Original UI check, available name | 3388 ms | 12 | 0 |
| Original portfolio, one owned domain with primary and no incoming offer | 6074 ms | 21 | 9 |
| New owned-list first paint, same public account | 3318 ms | 7 | 0 |

The original portfolio waited for owned enumeration, primary resolution and incoming history together. Primary resolution enumerated the owned domains again. Reverse-map and root checks were also repeated, and each domain was validated sequentially. Artwork subsequently performed further lifecycle reads.

These reads query ledger data; they do not execute the hook or wait for a transaction to validate. Network round trips and dependency chains account for the delay. Incoming discovery additionally scans paginated account history.

## Changes

- `getPortfolio()` returns native-verified domain summaries, token IDs/URIs, the owned primary candidate and the pinned ledger hash. It performs one enumeration and shares immutable state reads within that operation.
- State memoization is operation-local, clones returned buffers and rejects mixed ledgers. New operations are fresh, including with `bypassCache: true`. Identity, root-owner and recovery checks remain in place.
- Domain validation runs with bounded fan-out of four domains. Journal/root reads within each pinned snapshot run together.
- Owned cards render before incoming discovery finishes. Incoming errors no longer prevent owned domains from displaying. Session/request generations prevent stale results from replacing a newer account view.
- Refreshing or changing accounts cancels obsolete incoming scans before another history page/candidate is requested. An already dispatched RPC may finish, but its result cannot replace a newer view.
- Owned-card artwork uses the verified snapshot URI and SDK metadata helpers. It does not need another registration-status lookup per image; legacy bare-name URIs share one display-base lookup.
- `checkDomain()` reads TLD, price and full lifecycle state concurrently at one validated ledger. Prospective URIBase lookup overlaps lifecycle reads when a forward map is absent. Purchase still checks its current price and the hook enforces registration rules.

## Search latency limits

Search still needs 12 RPC requests for the full available-name check. Snapshot consistency and concurrency do not remove those integrity reads. Live timing remains variable: another same-connection sample measured 1764 ms for sequential composition and 2802 ms for the combined snapshot call, so these samples do **not** establish a stable wall-clock search speedup.

For consistently low-latency list/search displays at scale, use the indexer read model with its checkpoint/lag exposed. It is not enabled automatically by this change. Signing and write preflight must continue using the current ledger; index data must not become ownership or purchase authority.

## Verification

[SDK regressions](../../packages/sdk/test/read-performance.test.cjs) cover request counts, primary/root/recovery/identity mismatches, consistent quote ledgers, concurrent independent reads, operation-local memoization, buffer isolation and bounded fan-out. Live measurements were readonly and submitted no transactions. Timing samples are observations, not latency guarantees.

SDK regression suite: 90 passed. Application type checking and readonly browser checks passed; incoming-history cancellation has a focused regression test.

## Profile follow-up

The previous profile screen composed `describe`, registration/token-ID lookup, a native-object lookup, token URI lookup and avatar/metadata lookup separately. Those operations repeated root, recovery, token mapping, reverse mapping and native-token reads. The SDK now exposes `getProfileSnapshot()` with an operation-local immutable context shared across profile, lifecycle and token reads. `describe()` also deduplicates its internal reads. Native ownership, canonical identity and pending-state checks remain enforced.

The UI uses the returned avatar text and verified URI for artwork instead of another owner/avatar chain lookup. HTTP metadata loads after profile rendering; only legacy bare-domain artwork requires an extra display-base read. Custom-key descriptor reads run with a maximum concurrency of four, and root/recovery reads run together.

In the controlled fixture with one address and two text records, the separate-call composition used 29 RPCs and the new snapshot used 14, including the ledger lookup, with zero duplicate requests. This comparison already uses the optimized `describe()` and excludes the previous metadata fallback, so it conservatively counts the removed work. New calls still read fresh state rather than reusing an earlier operation's cache.

The [readonly browser measurement](../../test-app/tests/profile-performance-browser.cjs) opened `sdklive13386530.xah` on the public endpoint. One sample measured 8213 ms from an initially disconnected page (15 total RPCs) and 1925 ms using the existing connection (13 total RPCs). Both had 13 ledger-data requests and zero duplicates; the cold sample additionally included `server_info` and deployment hook enumeration. Artwork may still be fetching when the profile becomes visible. These are individual observations, not stable latency guarantees. A separate Node connection attempt timed out after 15 seconds, further illustrating transport variability.

Validation: 93 SDK tests, 221 application tests, TypeScript checking, browser smoke and the profile measurement passed. Regression coverage includes identity/owner mismatch, root plus pending state, transfer-offer display, fresh repeated snapshots and bounded custom-key discovery. No transactions were submitted.

## Artwork and connection-load follow-up

List images were both hidden and lazy-loaded, which can defer their requests indefinitely. The shared artwork renderer now requests them eagerly, hides the monogram while pending, and reveals a fallback only on missing/failed artwork. It retains a loaded image during refresh and rejects stale async results. Metadata images are preferred on cards and profiles, with profile-avatar text as an optional secondary source. Image requests have an eight-second fallback timeout.

The custom metadata proxy previously bypassed the SDK metadata cache. Fetch transports now have isolated bounded caches: concurrent/repeated URLs share one request, successful metadata lasts five minutes and failures five seconds. Legacy URI-base reads are shared per pinned ledger; they no longer block cards that already have full metadata URLs. Incoming offers include their verified token URI, eliminating artwork-triggered repeat identity reads. Connection and ownership checks remain unchanged.

Controlled browser tests verified one metadata HTTP request across multiple cards/profile and refresh, correct fallback behavior and stale-result handling. A live profile check received HTTP 200 from the configured metadata endpoint and displayed its 700×700 image at `https://xrpdomains.xyz/NFTDomains/xah/sdklive13386530.xah.png`. A subsequent profile sample measured 6688 ms cold and 2465 ms on an existing connection, with zero duplicate ledger-data RPCs. These samples still show variable transport latency; no eager connection was added.

Validation: 93 SDK tests, 223 application tests, TypeScript, artwork browser, live browser smoke, profile RPC measurement and on-demand connection browser checks passed. No wallet signatures or ledger writes were performed.
