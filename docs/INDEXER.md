# Indexer reference

API, event delivery and operational behavior of [@xahauname/indexer](../packages/indexer/README.md). The indexer reads validated ledger data and does not sign transactions. See the [architecture guide](ARCHITECTURE.md#indexer) for the source-level data flow.

## Install and test in this repository

Node.js 20+ is required. SQLite uses `better-sqlite3`; environments without a prebuilt binary need its native build prerequisites.

```sh
npm ci
npm run sdk:build
npm run indexer:test
```

The package exports CommonJS, ESM and TypeScript declarations. Published consumers will install `@xahauname/indexer` and the matching `@xahauname/sdk` peer dependency. Package preparation is described in the [workspace guide](PACKAGES.md).

## One network configuration

SDK, indexer and the test app share `resolveNetworkConfig` and `XAHAU_NETWORKS` from the SDK. Network profiles contain transport/NetworkID/Wallet Kit/explorer settings. Treasury, namespace and reviewed hook hashes identify a separate deployment.

```ts
import {resolveNetworkConfig} from '@xahauname/sdk';
import {createIndexer, SqliteStorage} from '@xahauname/indexer';

const config = resolveNetworkConfig({network: 'testnet'});
const storage = new SqliteStorage('./testnet.sqlite');
const indexer = createIndexer({network: config, storage});

// Explicit first run only: potentially expensive full-ledger scan at a pinned,
// validated hash. Use your own suitable RPC node, or a trusted LedgerSource.
if (!storage.checkpoint()) await indexer.bootstrap();
await indexer.syncOnce();
console.log(indexer.describe('alice.xah'));
console.log(indexer.listOwnedDomains(config.treasury));
console.log(indexer.status());
await indexer.source.disconnect();
storage.close();
```

For mainnet, set `network: 'mainnet'` and supply a reviewed mainnet `deployment` with `treasury`, `namespaceId`, `expectedNetworkId: 21337`, and `hookHashes`. No mainnet name-service deployment is bundled yet. Missing/wrong-network deployment values fail before connection; testnet identities never become mainnet defaults. An optional `wss` override changes transport, not deployment identity. The database is bound to network ID, treasury, namespace, decoder version and hash set; use a new database for another identity.

See [shared network configuration](NETWORKS.md). The existing hook deploy script remains explicitly testnet-only; configuring a client does not deploy a mainnet hook.

## Read API

| Method | Result |
| --- | --- |
| `bootstrap(checkpoint?)` | Pin a validated snapshot, verify installed hashes, scan state and issuer tokens; no invented historical events |
| `syncOnce()` | Verify saved anchor, replay every next validated ledger in order |
| `start({signal, intervalMs?, onError?})` | Poll heads, retry from last committed ledger; abort to stop |
| `describe(domain)` | Canonical domain profile or null; raw address values are uppercase hex |
| `listOwnedDomains(address)` | Consistent claimed domains only |
| `listIncomingOffers(address)` | Directed native offers, including transactions without HookExecutions |
| `getVerifiedPrimaryName(address)` | Primary with native owner and explicit XAH forward confirmation |
| `listRecovery()` | Quarantined domains, without hiding healthy domains |
| `events(afterCursor?, limit?)` | Durable cursor-ordered event outbox; maximum page 1000 |
| `status()` | Network ID, checkpoint hash/index, observed head and sampled lag |

Pending mint/offer is not ownership. A native/state mismatch, failed weak execution or incomplete transfer/burn cleanup is recoveryRequired. A domain under persistent quarantine cannot be silently promoted by a later event. Reconciliation is an operator/protocol task; this package has no on-chain repair function.

`describe()` is a read replica at `indexedThroughLedger`, not proof of current ownership. Recheck price, native owner, receiving record and offer on the ledger before signing or resolving a payment identity. `null` means absent from this snapshot/projection; it does not authorize purchasing an available name.

## Local service and SDK consumer

Set environment variables before starting; the example does not automatically load `.env` files. Node 22 users can run `node --env-file=.env.local examples/server.cjs` from this directory. Copy the public settings from [.env.example](../packages/indexer/.env.example); use no seeds.

```sh
npm run indexer:start
```

An empty database requires `XAHAU_INDEX_BOOTSTRAP=1` explicitly. The local server binds `127.0.0.1:8787` and supports:

`XAHAU_INDEX_SYNC=0` serves an existing snapshot without live RPC synchronization, useful for offline tests or maintenance. Its `lastSuccessfulSyncAt` is null. Always show status timestamps/errors as well as lag; lag is relative to the last observed head, not an independent freshness guarantee.

```text
GET /status
GET /profile?domain=alice.xah
GET /owned?address=r...
GET /incoming?address=r...
GET /primary?address=r...
GET /recovery
GET /events?after=0&limit=100
GET /stream?after=0
```

SSE supports `Last-Event-ID` and reconnect replay. Slow connections close and replay from their last received cursor. Consumers must deduplicate by event ID. Put this example behind a same-origin reverse proxy for a frontend; it deliberately does not enable unrestricted CORS. Authentication, rate limits, TLS and deployment supervision belong in the hosted service.

```ts
import {IndexerReadClient} from '@xahauname/sdk';
const reads = new IndexerReadClient({url: 'http://127.0.0.1:8787', networkId: config.expectedNetworkId!});
const {status, data} = await reads.describe('alice.xah');
// Render status/lag together with data. This client does not replace ledger writes.
```

## Event schema v1

Every event contains `schemaVersion`, `networkId`, `ledgerIndex`, `ledgerHash`, `transactionIndex`, `txHash`, `ordinal`, `id`, `type` and `data`; domain/token ID are included when established. IDs are `networkID:txHash:ordinal`. SQLite adds a monotonically increasing `cursor` for delivery.

Stable initial types: `StateChanged`, `DomainMinted`, `NativeOwnerChanged`, `NativeTokenBurned`, `DomainOfferCreated`, `DomainOfferRemoved`, `RefundSettled`, `HookExecutionFailed`, `OperationRejected`, `DomainClaimed`, `DomainTransferred`, `DomainBurned`, `DomainUpdated`, `DomainRecoveryRequired`. `DomainUpdated` carries before/after snapshots, including address, text, custom-key, primary and pending/refund changes. `DomainRecoveryCompleted` records verified reconciliation completion.

The pure `decodeTransaction(receipt, deployment, before)` validates committed metadata. It checks namespace keylets and known hook hashes. It does not infer success from return strings or apply provisional state from failed native transactions. Native and finalized domain events are separate. Emission parent IDs are retained where available; reconstruct the chain from stored receipts rather than assuming one parent is the original purchase.

## Reliability and current limits

- Full expanded validated ledgers provide ordering/completeness; account-only notifications are not the source of truth. Ledger-close subscriptions wake checkpoint replay; periodic polling handles missing notifications/reconnects. Subscription failures back off before retrying. Delivery order never determines ledger order.
- Projection changes, relevant raw receipts, events and checkpoint commit atomically per ledger. Default retention excludes unrelated network traffic; `retainAllReceipts: true` enables archival retention. Ledger rows retain transaction counts and a SHA-256 digest of ordered receipt hashes as local replay evidence, not a consensus transaction-root proof. Existing databases gain a nullable evidence column; historical rows are unchanged. Duplicate committed heads are idempotent. Gaps, bad parents, missing metadata and unknown deployment versions stop progress; errors are never silently skipped.
- A pinned bootstrap captures current state, not prior event history. Complete historical events require a snapshot from before the desired interval and an archival server retaining every later ledger.
- A SetHook upgrade stops replay. Verify the new deployment and bootstrap a separate database, or implement an audited multi-version history source; automatic upgrade decoding is not implemented.
- The SQLite adapter stores normalized key/value rows, relevant receipts and outbox. Ledger overlays and reverse dependencies update only affected domains; owner/inbox/recovery indexes avoid namespace-wide query scans. `listOwnedDomainsPage(address, {after?, limit?})` paginates the current indexed collection with a lexical cursor (default 50, maximum 200), returning its checkpoint; concurrent changes require refreshing the collection. The runtime still loads the materialized namespace and dependency indexes into RAM. This is suitable for testing and modest installations, **not a benchmarked million-domain architecture**. PostgreSQL, bounded-memory projection, pruning and performance gates remain future work. Existing unrelated receipts are not deleted automatically.
- The source interface is injectable for snapshots/fixtures/other RPC transports. Injected sources must supply complete ordered ledgers and validated, namespace-filtered snapshots; their completeness is a caller trust boundary.
- Testnet supports the explicit strong Invoke17 lifecycle reconciliation command. Indexer quarantine clears only after a known-handler receipt and verified committed cleanup. Controlled native weak-failure injection remains an open production gate. Historical fixtures pin the deployment that executed their transactions.

## Verification resources

Offline tests cover independent binary fixtures, real immutable profile/transfer receipts, custom keys, verified primary, pending/claim, offer discovery, transfer/burn cleanup, weak failure quarantine, namespace isolation, failed native execution, duplicate/shuffled deliveries, hash/gap detection, crash rollback, restart and network isolation.

```sh
npm run test:testnet --workspace @xahauname/indexer  # read-only current expanded-ledger check
node packages/indexer/test/capture-fixtures.cjs # explicit immutable receipt refresh; no signing
```

Tests and immutable receipts are in [packages/indexer/test](../packages/indexer/test/). Deployment evidence and verification scope are maintained in the [review index](review/README.md). Runtime databases are local data, separate from source.
