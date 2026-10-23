# Events and indexing proposal

Reviewed: 2026-10-23. This document records the original design proposal. An initial [developer indexer](../../indexer/README.md) now implements a subset with SQLite, validated-ledger polling/replay and an HTTP/SSE example; see [implementation evidence and remaining gates](INDEXER.md). Proposed granular event names and production storage features below are not all implemented. Collecting native transaction metadata needs no extra hook emission.

## Native emit and application events

Xahau `emit` creates a native transaction processed in a later ledger, with real fee/lifecycle implications. It is used for mint, offer and refund. It is not an EVM ABI event log. Adding a zero-value transaction to every record edit would add unnecessary execution and fees.

Consume validated notifications, HookExecutions, native token changes, HookState AffectedNodes and child EmitDetails. An indexer derives versioned business events. Return strings are acknowledgements/diagnostics bound to code versions; debug trace is not a durable public event bus.

Sources: [emitted transactions](https://xahau.network/docs/hooks/concepts/emitted-transactions/), [execution metadata](https://xahau.network/docs/hooks/concepts/execution-metadata/), [Xahau subscription API listing](https://xahau.network/docs/features/http-websocket-apis/public-api-methods/) and [transaction subscriptions](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/subscription-methods/subscribe).

## Read-only testnet proof

`node sdk/test/verify-streams.cjs` subscribed to treasury account plus ledger stream and received ledgerClosed. Treasury account_tx contained all seven sampled operations: purchase, claim, profile, transfer offer, transfer claim and two burns. Replay found four autonomous children: two Mint and two CreateSellOffer, all tesSUCCESS, correlated through EmitParentTxnID. Profile had 11 state nodes; transfer claim had 20. Across samples, 51 state-node ledger indices matched the treasury/key/namespace formula.

This is sampled coverage, not proof of account-only completeness for all failures/amendments. EmitFailure, future transaction types and history gaps require further tests. Local evidence: `hook/build/current/review/websocket-proof.json`.

```js
// After connecting an xahau Client to the verified network:
client.on('transaction', notification => {
  if (notification.validated !== true) return;
  enqueueForOrderedProcessing(notification);
});
await client.request({command: 'subscribe',
  accounts: [treasury], streams: ['ledger']});
```

The enqueue function is illustrative, not a shipped SDK API. Register listeners before subscription and handle queue bounds/reconnect.

## Proposed pipeline

Validated ledgers/transactions → durable raw ingest → protocol decoder → ordered database projection and outbox → application WebSocket/SSE.

Project domains, native owners, addresses, texts/custom keys, primary and incoming offers. UI list/search/profile reads can use the database. Ledger remains authoritative; recheck price/owner/offer before signing. Expose indexedThroughLedger and lag.

Bootstrap a pinned ledger L, buffer new notifications and replay after L in order, or reconstruct from complete history. Account subscriptions are a fast path; validated-ledger replay with tested filtering provides completeness. Missing history is an explicit incomplete/backfill condition, never a silently advanced checkpoint.

## Projection rules

1. Require validated=true and known network/treasury/namespace/version. Keep transaction index, engine outcome and every relevant hook result.
2. Resolve handler hashes valid at that ledger; switch decoder version at SetHook. Matching text from another hook is insufficient.
3. Verify state nodes by ledger index. Metadata fields may omit account/namespace. The pinned keylet formula is SHA512Half(`0076 || AccountID20 || stateKey32 || namespace32`): [upstream implementation](https://github.com/Xahau/xahaud/blob/5c05e107c0211dcedb7adcf73dab1f6012747fe7/src/libxrpl/protocol/Indexes.cpp#L196).
4. Obtain canonical names from parameters and verified mappings. A hash alone cannot reveal unknown domain/custom key names; bootstrap name slots and preserve unnamed legacy records.
5. Apply actual Created/Modified/DeletedNodes, including deletion. Accepted earlier executions and HookStateChangeCount do not prove commit after rejection. The insufficient-funds simulation ran eight hooks but produced zero HookState nodes, confirming why native engine outcome must also be checked.
6. Purchase/Mint/Offer are pending stages. Recipient ownership requires native buy and consistent domain finalization.
7. Native tesSUCCESS with failed weak processing is separate: apply observed native owner/deletion, mark domain recoveryRequired and suppress completed transfer/burn/available claims. Do not invent rollback or serve stale verified profile.
8. Correlate children using EmitParentTxnID and their hashes across the whole chain.
9. Track native offer creation/cancellation with empty HookExecutions. The sampled transfer offer had zero hook executions and state nodes, yet matters to Ready to claim.
10. Failed requests are diagnostics, not completed domain changes. Fee/bookkeeping changes remain separate.

## Proposed schema and events

Fields: schemaVersion, networkID, ledger index/hash, TransactionIndex, txHash, deterministic eventOrdinal, eventType, canonical domain/tokenID when known, actor, engine result, hook identity and actual changes. Deduplicate by networkID + txHash + eventOrdinal; operation correlation is separate.

| Event | Trigger |
| --- | --- |
| RegistrationRequested | Identity reserved and mint queued |
| DomainMinted | Recognized mint; recipient not yet owner |
| DomainOfferCreated/Cancelled | Native restricted offer, including external sellers |
| DomainClaimed/Transferred | Native buy plus consistent finalization |
| AddressChanged/Cleared | Confirmed value/index mutation |
| TextChanged/Cleared | Confirmed standard/service/custom change |
| ProfileUpdated | One aggregate event with batch set/clear keys |
| PrimaryChanged / DomainReset | Successful operation and state changes |
| NativeTokenBurned / DomainBurned | Separate native deletion from completed cleanup |
| RefundQueued/Settled | Correlated payment stage/confirmed settlement |
| DomainRecoveryRequired | Native/state mismatch or failed weak phase |
| ConfigurationChanged | Known pricing/TLD/pause/URIBase update |
| OperationRejected | Failure without a successful-mutation claim |

Names/schema are proposals, not current SDK methods. Same-owner buy need not generate a destructive transfer event.

## Reliability gates

Persist raw data, projection, checkpoint and outgoing outbox atomically per ledger. Order by ledger and TransactionIndex rather than arrival time. Delivery may be at least once; consumers deduplicate. Verify checkpoint hash/ledger continuity. Reconnect replays missed ledgers before announcing caught-up state.

Required tests: duplicate/shuffled notifications; reconnect gaps; pagination/history holes; snapshot L with writes at L+1; replayed callbacks; failed/expired emissions; weak failure with native success; offers without HookExecutions; transfer/reset/burn deletion; custom name discovery; multiple domains in a transaction; upgrade switching; full comparison against pinned namespace and native-token snapshots.

After these pass, introduce an SDK read-provider abstraction for indexer-backed list/describe while retaining ledger verification for critical actions. The current SDK remains ledger-backed. This review does not implement a production indexer or business-event subscription API.
