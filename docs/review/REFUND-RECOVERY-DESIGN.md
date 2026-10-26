# Refund recovery design

Status: proposal, 2026-10-26. No new opcode, journal layout or retry operation is deployed. Current behavior is defined by [SPEC](../SPEC.md); [native evidence](P2-STANDALONE-2026-10-26.md) proves failed refunds retain pending/correlation. SDK receipt diagnostics are observational only.

## Why a pending flag cannot authorize retry

Current `rfd:<token-prefix>` stores a transaction hash. It does not distinguish an in-flight Payment, validated failure, successful Payment with interrupted weak cleanup, or a missing callback. These states can all leave registration tracking. Emitting again from pending alone can double-pay. A client-supplied `failed` boolean, engine code or transaction hash is not native ledger proof. SDK `tx` RPC results are not an input the C hook can trust as authorization.

The current callback deletes pending before completing all correlation/identity cleanup. Therefore neither missing pending nor remaining identity maps is a reliable paid/unpaid journal. Existing records without a payment journal must stay in an explicit operator/migration path; an upgrade must not infer their outcome.

## Proposed bounded journal

Use one new 128-byte value under an unused auxiliary prefix, with full identity binding inside the value. This is a draft, not a frozen wire contract:

| Bytes | Value |
| --- | --- |
| 0–3 | Version, phase, retry count, lifecycle flags |
| 4–35 | Full URITokenID |
| 36–67 | Current correlated transaction hash (failure source, then refund) |
| 68–87 | Original pending recipient AccountID |
| 88–95 | Original pending amount, uint64 BE drops |
| 96–127 | Hash of canonical domain bytes |

Phases: `eligible`, `waiting`, `failed`, `paid`. Preserve the existing recipient/amount policy; redirecting to another wallet or changing refund eligibility requires a separate protocol decision. The full ID and canonical-name digest prevent a truncated-key match from authorizing another domain's cleanup. Account for the extra state entry/reserve in issuance economics and SDK estimates.

## Transitions

1. A verified mint/offer failure callback writes `eligible` and binds its source hash, recipient, amount and canonical domain. The conservative design defers refund emission to an explicit **strong** Invoke. Weak callbacks must not be assumed to atomically undo an accepted emission when a later journal write fails. This changes the automatic-refund flow and needs product/protocol review before implementation.
2. A strong request queues one refund and atomically binds its emitted hash to `waiting`; any binding failure rolls back that strong transaction. A refund callback must match the current full hash and inspect the runtime-defined outcome. A verified failure writes `failed`. A successful Payment writes `paid` **before** cleanup; failed proof writes leave the obligation unresolved, never eligible for blind retry.
3. A new explicit strong request/retry command accepts only `eligible` or `failed`, the unchanged original recipient/amount, a matching identity and a valid unclaimed native lifecycle. Restrict retries to the pending recipient or treasury. A proposed cap of three extra attempts bounds treasury-funded emission griefing; exceeding it requires operator handling. Do not turn a read or reconnect into a retry.
4. Retry emits once and atomically replaces the hash, increments the counter and sets `waiting`. Old callbacks no longer match. Any strong failure rolls back both emission and journal changes. Missing callbacks or `waiting` status do not justify another attempt.
5. `paid` permits only idempotent settlement, never emission. Cleanup reads its identity/recipient/amount from the journal, so partial pending/reverse-map deletion cannot erase proof. Delete the journal last. Strong settlement must preserve unrelated newer state and refuse conflicting token mappings or claimed ownership.
6. A minted treasury token may remain reserved after refund. Inspect native custody and explicit lifecycle policy rather than relying solely on a weakly written minted bit. Release/burn is a separate confirmed transition. Unknown expiry/callback evidence remains quarantined.

The retry command should continue to be available while issuance is paused, subject to its own authorization and safety checks. A recipient requiring DestinationTag must correct that condition before retry under the current fixed-payment format; an arbitrary replacement address/tag is not silently accepted.

An application can request a separate refund signature, or an explicitly authorized keeper can pay for the strong queue transaction. Preserving automatic emission instead requires a separately proven prebinding protocol (including the exact emitted hash before money can leave) and native emit/journal fault coverage; it is not a small retry-only patch.

## Required implementation evidence

The existing issuance callback already has a static worst-case count of **63,466 / 65,535** instructions. A broad test wrapper exceeded this budget at 66,562. Resource planning is a prerequisite: measure/refactor the production handler and respect native chain/callback routing constraints before adding the journal. Do not assume another handler slot or helper export is available, or raise guards/checker limits to fit it.

- Build/unchanged guard checks and resource bounds for the production artifact; no probe-only helper exports.
- Model every journal/write/delete/emit boundary, including paid proof preceding cleanup, failed proof writes, stale and duplicate callbacks, retry cap and unrelated-state preservation.
- Native callback failure/expiry semantics pinned to a node revision; actual failed/successful refund, failed retry emission, failed strong repair, missing callback and repeated settlement.
- Exact one-payment accounting across retries, including a successful Payment whose callback cleanup fails. This is the decisive double-payment regression.
- Native maximum record inventory and indexer quarantine/settlement projection, SDK receipt validation, friendly UI and migration of legacy unresolved obligations.

Until that implementation and evidence exist, the safe supported behavior is to retain tracking, inspect `getRefundStatus()`, and require operator investigation. Ordinary lifecycle `reconcile` must not discard or repay refund obligations.
