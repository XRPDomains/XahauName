# @xahauname/indexer

A ledger-backed read model and event layer for XahauName. Replay validated Xahau ledgers, query domain profiles and ownership, and deliver changes to applications through a persistent event outbox.

The package combines a ledger source, metadata decoder, domain projection and SQLite storage. A local HTTP/SSE server demonstrates how to expose the read model to another application. Signing and domain transactions remain in the [SDK](../sdk/README.md).

## Quickstart

Use Node.js 20+ and run from the repository root:

```sh
npm ci
npm run indexer:build
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

`bootstrap()` captures a pinned validated snapshot. `syncOnce()` replays subsequent ledgers from the saved checkpoint. Use `start({signal})` for continuous synchronization. The [network guide](../../docs/NETWORKS.md) explains network selection, custom RPC endpoints and deployment identities.

Each database is bound to its network, treasury, namespace, decoder and hook hash set. Deployment changes require a matching database/bootstrap or an explicit history migration. The [indexer reference](../../docs/INDEXER.md#reliability-and-current-limits) describes snapshot, replay and storage behavior.

## What applications can read

| Data | API |
| --- | --- |
| Domain profile and owner | `describe(domain)` |
| A wallet's domain portfolio | `listOwnedDomains(address)` |
| Directed incoming offers | `listIncomingOffers(address)` |
| Forward-confirmed primary identity | `getVerifiedPrimaryName(address)` |
| Domains awaiting reconciliation | `listRecovery()` |
| Indexed checkpoint and synchronization status | `status()` |
| Cursor-based event history | `events(afterCursor, limit)` |

Every read reflects the indexed checkpoint. The SDK can verify current ledger identity and transaction conditions when an application needs a fresh authoritative read.

## Serve HTTP and events

The [server example](examples/server.cjs) exposes profiles, portfolios, primary names, incoming offers, status and cursor-based events. Copy settings from [.env.example](.env.example), configure the environment, then run:

```sh
npm run indexer:start
```

The example binds to http://127.0.0.1:8787/. Its first database snapshot uses `XAHAU_INDEX_BOOTSTRAP=1`. See [service configuration and endpoints](../../docs/INDEXER.md#local-service-and-sdk-consumer) for the complete setup.

Applications can use `IndexerReadClient` from the SDK for HTTP reads, or subscribe to the SSE stream and resume from their last event cursor. [Event schema and delivery](../../docs/INDEXER.md#event-schema-v1) describe IDs, ordering and replay.

[read-events.mjs](../../docs/examples/read-events.mjs) is a runnable cursor-based HTTP consumer; its [setup guide](../../docs/examples/README.md) lists the shared configuration variables.

## Source guide

| File | Responsibility |
| --- | --- |
| [src/index.ts](src/index.ts) | Bootstrap, ordered replay, projections, checkpoints and public queries |
| [src/source.ts](src/source.ts) | RPC connection, validated snapshots and expanded-ledger retrieval |
| [src/decoder.ts](src/decoder.ts) | Decode committed native/hook metadata into changes and events |
| [src/projection.ts](src/projection.ts) | Build domain profiles and verify ownership/cleanup consistency |
| [src/storage.ts](src/storage.ts) | SQLite persistence, atomic commits and event cursors |
| [src/types.ts](src/types.ts) | LedgerSource, Storage, receipt, checkpoint and event contracts |
| [examples/server.cjs](examples/server.cjs) | HTTP/SSE service and environment configuration |

The package exports CommonJS, ESM and declarations. SQLite uses better-sqlite3; environments without a compatible prebuilt binary need native build tools. To run the repository suite, use `npm run indexer:test`.

See the [full reference](../../docs/INDEXER.md), [architecture](../../docs/ARCHITECTURE.md#indexer) and [package maintenance guide](../../docs/PACKAGES.md).
