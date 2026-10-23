# Test strategy and coverage matrix

Reviewed: 2026-10-23. Hook artifacts: installed release 0.3.0, unchanged in this review. Counts: 216 WASM probes (101 lifecycle, 30 profile, 12 policy, 73 validation), 67 SDK regressions and 129 application/integration units; typechecks and 16 browser checks pass. Model pass counts do not prove native ledger failure semantics. See [open findings](FINDINGS.md).

## Ten handlers, one protocol

| Slot | Handler | Responsibility | Critical assertions |
| --- | --- | --- | --- |
| 0 | issuance | Native purchase/register, name/TLD/price/pause checks; mint/offer/refund callback stages | Reserve only once; no root owner before claim; correlate every emitted tx |
| 1 | set-address | Set/clear bounded binary address and its index | Coin IDs0..65535;1..128 bytes; checked index/value writes |
| 2 | authorization | Match root owner and native token owner | Reject stale owner; strong-phase rejection undoes prior address writes |
| 3 | set-text | Ordinary standard/service/custom text writes | Key/value bounds; distinct custom names; no orphan slots |
| 4 | clear-text | Remove text and associated index/name slot | Correct key; slot reuse; failed delete cannot acknowledge success |
| 5 | control | Set/unset/replace primary; reset records | Stale unset preserves newer primary; complete bounded cleanup |
| 6 | admin | Pricing, enabled TLD/tombstone, pause, URIBase | Treasury only; exact encodings; base affects future mint only |
| 7 | claim | Observe native buy, finalize first claim or transfer cleanup; reject Remit bypass | Native/root consistency; old primary and every record cleared; weak failure recovery gate |
| 8 | burn | Clean state after native token burn | No dangling root/maps/records; weak failure recovery gate |
| 9 | profile | Atomic Global Keys mask batch; legacy-v1 compatibility | One Invoke; disjoint masks; capacity; all-or-nothing strong mutation |

The split satisfies native instruction/nesting limits. Each handler accepts unrelated commands and finishes its own execution; accept does not mean every handler ran or the requested business operation succeeded. Strong and weak phases have different rollback authority.

## Automated input cases

U = SDK/UI unit. M = real production WASM with modeled ledger APIs and guards. L = existing live testnet or read-only simulation evidence. P = planned native integration/fault gate.

| Case | Expected behavior | Coverage |
| --- | --- | --- |
| Friendly ` Alice ` / `ALICE` / `al ice` | UI strips whitespace/lowercases/adds .xah and shows canonical name before payment | U |
| Raw leading/trailing/internal spaces, tab/newline | Hook rejects34; direct protocol never silently removes whitespace | M |
| Raw uppercase label/TLD | Hook lowercases; reserves canonical name, not a second distinct name | M |
| Underscore, slash, colon, at-sign, dot, HTML-like text, NUL, Unicode, emoji, zero-width space | Reject10, or malformed transport3; SDK stops before signing | U/M; underscore/Unicode L simulations |
| Missing friendly TLD | UI appends .xah; missing raw tld rejects3 | U/M |
| Label lengths0/1/57/58/65 |0 or missing rejects3;1/57 valid;58 rejects10;65 exceeds transport and rejects3 | U/M |
| Leading/trailing/internal hyphen | Edge hyphens reject; internal hyphen valid | U/M |
| Reserved xahau/treasury/admin/root/www | Reject10; SDK builder rejects before signing | U/M |
| TLD empty/1/9 chars, bad punctuation, unknown/disabled TLD | Malformed3/36 or disabled33; built-in tombstones stay disabled | M |
| Same canonical domain already claimed | Reject31 without new pending/map/emit | M |
| Second buyer while pending; URIBase changed during pending | Reject55/reservation; one identity only | M; actual concurrent ledger race P |
| Exact price / one drop short / zero payment | Exact proceeds; underpayment50 | M; exact L |
| Pricing values0/1/uint64 maximum; table lengths9/10/11 | Validate encoding and native viable payment policy; zero-priced purchase needs an explicit policy | U/M encoding subset; native viability P |
| Overpayment | Currently accepted, no automatic change refund; SDK sends quoted amount | M; policy decision remains documented |
| Wallet lacks amount, fee or reserve | Ledger/wallet failure; not hook underpayment50 | U mappings; insufficient payment amount L simulation; fee/reserve boundaries P |
| Missing pricing / paused / disabled TLD |51/52/33, no issuance side effects | M |
| PartialPayment / issued-currency amount |54/53 | M |
| Address coin0/65535/65536/negative/short/missing | Bounded IDs valid; malformed/out-of-range rejects3 | U/M |
| Address1/128/129 bytes, empty/odd/nonhex |1/128 valid; oversized/malformed rejects3 | U/M; six real codecs L |
| Text key1/40/41 bytes, empty, punctuation, uppercase | Valid bounds; invalid rejects3; keys lowercase | U/M |
| Value1/128/129 bytes, multibyte UTF-8, empty | UTF-8 byte limit; empty requires clear; invalid UTF-8 rejected by typed reader | U/M |
| Fifteenth/sixteenth address/text, replacement at capacity | Fifteen works; new sixteenth rejects62; update/reuse does not leak index entries | M |
| Profile overlap/unknown bits/missing values/extraneous p-values, mixed single/batch mode | Reject whole patch; unrelated/custom records preserved | U/M |
| Nonowner/old owner/native-owner mismatch/admin bypass | Reject unauthorized mutations; treasury reset remains explicit authority | M/L |
| Bare Payment, wrong marker/op, retired lock, arbitrary URI | Pass-through has no name success acknowledgement; invalid op4; caller URI64 | U/M/L |

## Lifecycle and fault cases

| Area | Required assertions | Current evidence |
| --- | --- | --- |
| Mint -> offer -> claim | Sequential dependent emit; no ownership until buy; designated recipient only | M/L |
| Emission API failure at reserve/details/fee/emit/state correlation | No false success; pending handling and refund policy known | Some M; full per-call fault matrix P |
| Duplicate/out-of-order/uncorrelated callback, missing metadata, EmitFailure | Never double finalize/refund; unresolved outcomes remain visible | M subset; real expiration/replay P |
| Transfer create/cancel/recreate/claim | Recipient sees incoming offer; sender owns until claim; all custom keys/addresses/primary cleared | M/L |
| Strong write/delete failure | No operation success or partial committed record changes | M; ledger sandbox equivalence P |
| Weak claim/burn state write/delete failure with native tesSUCCESS | Native outcome may remain final; SDK reports recovery and indexer quarantines inconsistent domain | SDK receipt M/U; native fault injection and repair P, release gate |
| Burn then register the same name again | New lifecycle, no inherited records/primary, old callbacks cannot settle new pending | Availability/cleanup M/L; full remint/reclaim and replay sequence P |
| Reset/burn max15+15, named/legacy custom slots | Complete cleanup, identity retention/removal per operation | M/L |
| Primary replace/unset/forward address mismatch/tags | One candidate; verified native round trip; no owner/XRP fallback | U/M/L |
| Disconnect after payment, wallet declines claim, invalid/missing hash, confirmation timeout | No duplicate purchase; preserve hash; manual claim remains available | U; real wallet/provider exceptions manual |
| Indexed replay/reconnect/duplicate notification/missed ledger/upgrade | Deterministic projection, persisted cursor, no skipped events | Proposed indexer; not implemented |

## Automation gates

1. Every client change: SDK/UI unit tests and typechecks; validation must happen before a signing request.
2. Every C change: affected production WASM build, unchanged native guard checker, all model suites. Common-header changes rebuild every handler.
3. Before testnet release: existing journaled live suite with fresh wallets and full cleanup, then read-only deployment/namespace checks.
4. Before production: run a disposable local xahaud ledger integration fixture with controlled state-write, weak-phase, emission/expiration, reserve and reconnect faults. Prove reconciliation or revise the strong/weak design. This gate is OPEN.
5. Before indexer release: deterministic historical replay, disconnect/backfill, duplicate/order tests and comparison with a pinned on-chain snapshot. This gate is OPEN.

## Manual exceptions only

Keep manual acceptance for actual GemWallet/Xaman/Xyra consent, popup/deep-link/mobile behavior, session expiry/account switching across provider versions, public-origin OAuth/CORS, accessibility/readability and recovery runbook rehearsal. Ordinary malformed names, duplicate names, numeric limits, price/pause/permission and record cleanup should not need repeated manual entry.

## Commands

```sh
node scripts/test-hooks.mjs
npm run sdk:test
npm run app:test
npm run app:typecheck
npm --prefix test-app run test:browser
node packages/sdk/test/verify-release.cjs
node packages/sdk/test/verify-streams.cjs
node packages/sdk/test/verify-failures.cjs
```

Live writes remain a separately authorized testnet operation. Native fault-injection and the business-event projector are planned work, not covered by these commands today.

The insufficient-funds simulation produced tecUNFUNDED_PAYMENT despite eight hook executions; metadata contained zero HookState changes. It left the real account sequence/balance and domain availability unchanged. This verifies a simulated rejection path, not consensus or weak-phase fault recovery.
