# Verified read API

`client.read` offers named arguments and verified ledger reads. Existing client, resolver and registrar APIs retain their meanings and remain available. A missing domain or record returns `null`; RPC failures, invalid state and ownership mismatches reject the promise.

```ts
import {XahauNameClient,resolveNetworkConfig} from '@xahauname/sdk';

const client = new XahauNameClient(resolveNetworkConfig({network: 'testnet'}));
try {
  const snapshot = await client.read.snapshot();
  const owner = await snapshot.getOwner({name: 'alice.xah'});
  const address = await snapshot.getAddress({name: 'alice.xah', coinType: 21337});
  const records = await snapshot.getRecords({
    name: 'alice.xah', addresses: [0, 60, 21337], texts: ['description', 'url'],
  });
  console.log({owner, address, records});
} finally {
  await client.disconnect();
}
```

The facade connects lazily, verifies the configured deployment and pins each operation to a validated ledger. A snapshot reuses successful identity/state reads across its calls. Create a new snapshot after a write or when refreshing; an existing snapshot deliberately continues to describe its original ledger. Failed reads are evicted for retry. Snapshot memoization is bounded to 4,096 state and 4,096 object entries; eviction can cause another read of that same immutable ledger.

| Method | Result |
| --- | --- |
| `getOwner({name})` | Native-verified owner, separate from receiving records |
| `getAddress({name, coinType?})` | Decoded receiving address; default coin 21337; no owner fallback; unsupported/malformed codec rejects |
| `getText({name, key})` | UTF-8 record after verifying domain ownership |
| `getRecords({name, addresses?, texts?, contentHash?})` | Decoded addresses with `address`/`hex` format, texts, unnamed legacy keys, source, ledger hash and completeness |
| `getProfile({name, addrs?, texts?})` | Verified profile, native token ID/URI and transfer offer; rejects unfinished lifecycle state; no HTTP metadata fetch |
| `getName({address, name?})` | Forward-confirmed native-XAH primary; optional candidate name avoids enumerating owned tokens |
| `getDomain({name})` | Registration/claim/refund/recovery lifecycle state |
| `getQuote({name})` | Same-ledger lifecycle, price and TLD availability; purchase still rechecks |
| `getNames({address, cursor?, limit?})` | One account-object page: `items: OwnedDomainSummary[]` (read each item's `.domain`), `nextCursor`, `complete`, `ledgerHash`, `source` |

For selected records, supply both `addresses` and `texts`, using `[]` to omit a category. This bypasses record-index/custom-descriptor discovery and deduplicates keys. A selection contains at most 64 requested keys and reports `complete: false`. Omit both arrays to discover the full indexed profile; legacy unnamed custom keys still make it incomplete. `contentHash: true` also returns the validated content URI and encoded content-hash hex when present. Unknown address codecs remain explicitly marked raw hex in `getRecords`; `getAddress` requires a supported codec. Use low-level `resolver.getAddr` for raw bytes.

Pages contain at most the requested number of **ledger objects**, so `items` may be empty while `nextCursor` is present. Follow the cursor until null to enumerate all recognized domains. Limit is 1–200, default 50. Cursors bind the wallet and ledger; they are not authorization credentials. Reusing a cursor with another wallet or snapshot rejects. Pruned pinned ledgers can make an old cursor unavailable. Complete legacy list methods retain a 100-page safety limit.

All facade calls accept `ledgerHash`, `bypassCache`, `timeoutMs` (default 15,000) and `signal`. Deadlines cover connection and pending reads. Cancellation stops the consumer's wait; an already dispatched shared RPC continues and never submits a transaction. A transaction confirmation timeout preserves its hash and means unknown outcome; inspect it before retrying a payment.

## Read budgets and discovery

Client defaults are 512 cached entries, approximately 1 MiB retained cache, 30-second TTL, six concurrent RPC reads and at most 1,024 queued reads. Configure `cacheMaxEntries`, `cacheMaxBytes`, `cacheTtlMs` and `readConcurrency` (1–32). A zero cache budget/TTL disables state storage. Clearing the cache or changing signer prevents older in-flight reads from repopulating it. These budgets cover retained values/estimates, not the JavaScript engine's total heap.

`getPortfolio(address)` remains the combined collection read for existing views. Its primary is an owned candidate; use `getName` or `getVerifiedPrimaryName` for forward confirmation. Pass an indexer/portfolio candidate to `getName({address, name})` to avoid another portfolio scan.

`listIncomingDomains` shares one snapshot and verifies candidates with bounded concurrency. Completed inboxes are reused only at the identical immutable ledger. Subsequent heads scan new account-history ledgers and revalidate active offers. Discovery cache is bounded to 32 wallets and approximately 1 MiB. It still needs an initial history scan, can fail at the 100-page/20,000-candidate limit, and exposes `historyMinLedger`; pruned history is not proof that no old offer exists. For large accounts use the [indexer](INDEXER.md) for discovery, then verify ledger state before signing.

Network selection uses the [shared configuration](NETWORKS.md). No read method silently substitutes the bundled testnet deployment for mainnet.
