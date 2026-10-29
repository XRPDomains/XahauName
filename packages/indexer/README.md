# @xahauname/indexer

A ledger-backed read model and event layer for XahauName. Replay validated Xahau ledgers, query domain profiles and ownership, and deliver changes to applications through a persistent event outbox.

The package combines a ledger source, metadata decoder, domain projection and SQLite storage. A local HTTP/SSE server demonstrates how to expose the read model to another application. Signing and domain transactions remain in the [SDK](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/README.md).

## Quickstart

Install in your service (Node.js 20+):

```sh
npm install @xahauname/indexer @xahauname/sdk
```

```ts
import {resolveNetworkConfig} from '@xahauname/sdk';
import {createIndexer, SqliteStorage} from '@xahauname/indexer';

const config = resolveNetworkConfig({network: 'testnet'});
const storage = new SqliteStorage('./xahauname.sqlite');
const indexer = createIndexer({network: config, storage});

try {
  if (!storage.checkpoint()) await indexer.bootstrap();
  await indexer.syncOnce();

  console.log(indexer.describe('alice.xah'));
  console.log(indexer.listOwnedDomains(config.treasury));
  console.log(indexer.status());
} finally {
  await indexer.source.disconnect();
  storage.close();
}
```

`bootstrap()` captures a pinned validated snapshot. `syncOnce()` replays subsequent ledgers from the saved checkpoint. The example above performs one synchronization and exits; it does not run a background listener. For continuous synchronization, replace `await indexer.syncOnce()` with:

```ts
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
await indexer.start({
  signal: controller.signal,
  onError: error => console.error('Sync failed; retrying:', error),
});
```

The surrounding `finally` closes storage when the loop ends. Without `onError`, the first synchronization error rejects `start()`. The [network guide](https://github.com/XRPDomains/XahauName/blob/main/docs/NETWORKS.md) explains custom RPC endpoints and deployment identities. Mainnet requires an explicit reviewed deployment manifest; no mainnet name-service deployment is bundled.

## Existing data and history

A new snapshot includes existing names, ownership and current profile records at its checkpoint. It does **not** reconstruct earlier transaction/event history or removed records. Replay and event delivery start after that checkpoint. For historical events, explicitly bootstrap at an earlier retained checkpoint and use an RPC server that retains the required ledger state and expanded transactions. A persisted database resumes from its committed checkpoint; a replay gap stops synchronization rather than skipping missing ledgers.

Continuous synchronization subscribes to ledger-close notifications as wake-up hints, with periodic polling and checkpoint replay as fallback. Relevant receipts are retained by default; pass `retainAllReceipts: true` for full network archival. Domain projection and owner/inbox indexes update incrementally. `listOwnedDomainsPage(address, {after?, limit?})` returns a bounded result page; the runtime still holds the materialized namespace in RAM.

Bootstrap retries a timed-out/disconnected read up to twice, retaining its pinned ledger hash and page marker. Completed pages stay in memory during those retries. RPC errors and invalid data stop bootstrap; the database checkpoint commits only after the complete snapshot. A failed process still requires a fresh scan. To configure retry limits, inject `new XahauLedgerSource(config, undefined, {snapshotReadRetries: 2, snapshotRetryDelayMs: 250})` as `source` when creating the indexer. Retries may be disabled with `snapshotReadRetries: 0`; reconnect/network verification failures stop immediately.

Each database is bound to its network, treasury, namespace, decoder and hook hash set. Deployment changes require a matching database/bootstrap or an explicit history migration. The [indexer reference](https://github.com/XRPDomains/XahauName/blob/main/docs/INDEXER.md#reliability-and-current-limits) describes snapshot, replay and storage behavior.

## What applications can read

| Data | API |
| --- | --- |
| Domain profile and owner | `describe(domain)` |
| A wallet's domain portfolio | `listOwnedDomains(address)` |
| A bounded portfolio page | `listOwnedDomainsPage(address, {after, limit})` |
| Directed incoming offers | `listIncomingOffers(address)` |
| Forward-confirmed primary identity | `getVerifiedPrimaryName(address)` |
| Domains awaiting reconciliation | `listRecovery()` |
| Indexed checkpoint and synchronization status | `status()` |
| Cursor-based event history | `events(afterCursor, limit)` |

Every read reflects the indexed checkpoint. `describe()` returns a projection, not the SDK's `ProfileSnapshot`; `status()` reports checkpoint, observed head, lag and last synchronization/error. Check freshness and use the SDK for current ledger identity and transaction conditions before signing. The indexer stores a derived read model: authoritative ownership and records remain on-chain.

## Serve HTTP and events

The [server example](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/examples/server.cjs) exposes profiles, portfolios, primary names, incoming offers, status and cursor-based events. From an installed npm package, start it with these environment variables (POSIX shell):

```sh
XAHAU_NETWORK=testnet XAHAU_INDEX_BOOTSTRAP=1 XAHAU_INDEX_DB=./data/xahauname.sqlite node node_modules/@xahauname/indexer/examples/server.cjs
```

The example binds to http://127.0.0.1:8787/. `XAHAU_INDEX_BOOTSTRAP=1` authorizes the first snapshot; it does not reset an existing database. Environment files are not loaded automatically. Set variables using your shell or service manager; the repository's [.env.example](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/.env.example) lists the available settings, including `XAHAU_WSS`, `XAHAU_DEPLOYMENT_FILE`, `PORT` and snapshot-only mode. In a repository clone, `npm run indexer:start` launches the same example. This loopback-only example is not a hosted API; configure your own service/proxy for remote access. See [service configuration and endpoints](https://github.com/XRPDomains/XahauName/blob/main/docs/INDEXER.md#local-service-and-sdk-consumer).

Applications can use `IndexerReadClient` from the SDK for HTTP reads, or subscribe to the SSE stream and resume from their last event cursor. [Event schema and delivery](https://github.com/XRPDomains/XahauName/blob/main/docs/INDEXER.md#event-schema-v1) describe IDs, ordering and replay.

[read-events.mjs](https://github.com/XRPDomains/XahauName/blob/main/docs/examples/read-events.mjs) is a runnable cursor-based HTTP consumer; its [setup guide](https://github.com/XRPDomains/XahauName/blob/main/docs/examples/README.md) lists the shared configuration variables.

## Source guide

| File | Responsibility |
| --- | --- |
| [src/index.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/src/index.ts) | Bootstrap, ordered replay, projections, checkpoints and public queries |
| [src/source.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/src/source.ts) | RPC connection, validated snapshots and expanded-ledger retrieval |
| [src/decoder.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/src/decoder.ts) | Decode committed native/hook metadata into changes and events |
| [src/projection.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/src/projection.ts) | Build domain profiles and verify ownership/cleanup consistency |
| [src/storage.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/src/storage.ts) | SQLite persistence, atomic commits and event cursors |
| [src/types.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/src/types.ts) | LedgerSource, Storage, receipt, checkpoint and event contracts |
| [examples/server.cjs](https://github.com/XRPDomains/XahauName/blob/main/packages/indexer/examples/server.cjs) | HTTP/SSE service and environment configuration |

The package exports CommonJS, ESM and declarations. SQLite uses better-sqlite3; environments without a compatible prebuilt binary need native build tools. Repository development:

```sh
npm ci
npm run indexer:build
npm run indexer:test
```

See the [full reference](https://github.com/XRPDomains/XahauName/blob/main/docs/INDEXER.md), [architecture](https://github.com/XRPDomains/XahauName/blob/main/docs/ARCHITECTURE.md#indexer) and [package maintenance guide](https://github.com/XRPDomains/XahauName/blob/main/docs/PACKAGES.md).
