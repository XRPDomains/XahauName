# @xahauname/sdk

The TypeScript client for XahauName. Resolve on-chain names and profiles, manage domain ownership and records, integrate wallet signing, and consume indexed application data through one API.

The SDK provides a client, registrar and resolver modules, address/content codecs, typed profile conventions, transaction confirmation and Wallet Kit integration. It exports CommonJS, ESM and TypeScript declarations for Node.js 20+ and browser bundlers.

Ownership, name/token mappings and profile records are on-chain. Artwork and other content referenced by HTTPS/IPFS records are fetched separately. All records are public; do not store secrets in a profile.

For new integrations use the [verified read facade](https://github.com/XRPDomains/XahauName/blob/main/docs/READ-API.md): `client.read.getOwner({name})`, `getAddress`, `getText`, `getRecords`, `getProfile`, `getName`, `getDomain`, `getQuote` and paginated `getNames`. `client.read.snapshot()` shares one immutable ledger across related calls. Existing APIs remain compatible.

## Quickstart

Install in your application (Node.js 20+):

```sh
npm install @xahauname/sdk
```

```ts
import {XahauNameClient, resolveNetworkConfig} from '@xahauname/sdk';

const config = resolveNetworkConfig({network: 'testnet'});
const reader = new XahauNameClient(config);
try {
  // Connect lazily and share one validated ledger across related reads.
  const snapshot = await reader.read.snapshot();
  const name = 'alice.xah';
  const owner = await snapshot.getOwner({name});
  const profile = await snapshot.getProfile({name});
  const receivingAddress = await snapshot.getAddress({name, coinType: 21337});
  const namesPage = owner ? await snapshot.getNames({address: owner, limit: 50}) : null;
  const primary = owner ? await snapshot.getName({address: owner, name}) : null;

  console.log({owner, profile, receivingAddress, namesPage, primary});
} finally {
  await reader.disconnect();
}
```

Public owner/profile reads verify native token identity. A receiving address is an explicit record, separate from the owner: `getAddress()` returns `null` when absent, with no owner fallback. `getName({address, name})` checks whether that candidate is the wallet's forward-confirmed primary; omit `name` to discover it. Missing names/records return `null`; network errors and inconsistent ownership reject the promise.

`getProfile()` returns `{ledgerHash, profile, tokenId, uri, transferOffer}` or `null`, rather than a bare profile. `getNames()` returns `{items, nextCursor, complete, ledgerHash, source}`. Follow `nextCursor` until `null`, even when a page has no items: its limit counts scanned ledger objects. A snapshot stays pinned; create a new snapshot after a write or refresh.

For list and search screens, the SDK provides combined reads:

```ts
await reader.connect();
try {
  const quote = await reader.read.getQuote({name: 'alice.xah'});
  console.log(quote.status.stage, quote.priceDrops, quote.tldEnabled);
  const owner = await reader.getOwner('alice.xah');
  if (owner) {
    const portfolio = await reader.getPortfolio(owner);
    console.log(portfolio.domains, portfolio.ledgerHash);
  }
} finally {
  await reader.disconnect();
}
```

Each combined read uses one validated ledger. `getPortfolio()` returns verified token URIs alongside domain names; its `primary` is an owned candidate, requiring `getName({address, name})` for forward confirmation. Load incoming offers independently so their initial account-history scan does not delay the owned list. The existing `describe()`, `checkDomain()` and positional resolver methods remain available.

The network in this example selects the bundled deployment. To use another deployment or network, supply its public treasury, namespace and hook hashes through [shared network configuration](https://github.com/XRPDomains/XahauName/blob/main/docs/NETWORKS.md).

`resolveNetworkConfig({network: 'mainnet'})` requires an explicit reviewed `deployment`; there is no bundled mainnet name-service deployment. Selecting a network changes transport settings, not the identity of an existing installation.

For a complete runnable program, see [read-profile.mjs](https://github.com/XRPDomains/XahauName/blob/main/docs/examples/read-profile.mjs), which pins profile, portfolio and primary reads to one validated ledger. [Example setup](https://github.com/XRPDomains/XahauName/blob/main/docs/examples/README.md) describes its network configuration.

## Connect a wallet signer

Use an already connected Wallet Kit `manager` and a connected read client. The RPC client prepares fees and confirms submitted transactions:

```ts
import {createWalletKitSigner, XAHAU_NETWORKS} from '@xahauname/sdk';

await reader.connect();
const network = XAHAU_NETWORKS.testnet;
const signer = createWalletKitSigner(manager, reader.rawClient, {
  network: network.walletKitId,
  networkId: network.networkId,
  maxFeeDrops: '1000000',
  onSubmitted: hash => console.log('Submitted:', hash),
});

// Reuse the connected SDK client for reads, fee preparation and confirmation.
reader.setSigner(signer);
const writer = reader;
```

Use the same selected network for the wallet and deployment. The adapter captures the account; recreate it when the wallet account/network changes. Default fee preparation is `sdk`. Use `feePreparation: 'wallet-kit'` only with a manager that enforces `maxFeeDrops`. Other integrations can provide the SDK's `TxSigner` contract. See [wallet integration](https://github.com/XRPDomains/XahauName/blob/main/docs/WALLET-INTEGRATION.md) for session lifecycle, shared RPC transport and validated receipts.

## Register and manage a profile

With a connected `writer` and its `signer` from the previous example:

```ts
const quote = await writer.read.getQuote({name: 'example.xah'});
// Show quote.priceDrops to the user before calling buyAndClaim.
await writer.registrar.buyAndClaim({
  label: 'example', tld: 'xah', expectedPriceDrops: quote.priceDrops,
});

await writer.resolver.setProfile({
  label: 'example', tld: 'xah',
  set: {description: 'My public profile', url: 'https://example.com'},
});

await writer.resolver.setAddress({
  label: 'example', tld: 'xah',
  coinType: 21337, address: signer.address,
});

await writer.resolver.setPrimary({label: 'example', tld: 'xah', flag: true});
await writer.resolver.setText({
  label: 'example', tld: 'xah', key: 'com.github', value: 'example',
});
```

`expectedPriceDrops` binds the approved drop amount; a changed price raises `PRICE_CHANGED` before wallet dispatch. Purchase and claim are separate wallet approvals; `buyAndClaim()` coordinates them. If interrupted, inspect registration status before offering another payment. A profile batch uses one Invoke/signature, while an unchanged patch returns null. All profile fields are optional; submit only edits and use `clear: ['email']` for an explicit removal. Transfer acceptance clears the prior owner's records and primary selection.

For an interrupted purchase, inspect `registrar.getRegistrationStatus(domain)` first. Its optional `refundTxHash` identifies a tracked refund without adding a receipt RPC. Call `registrar.getRefundStatus(domain, {ledgerHash?})` explicitly to inspect its validated outcome. `failed` and `paid` both require operator attention while tracking remains; this read never retries a payment. `notTracked` means no current refund correlation, not proof that no historical refund occurred. See [refund diagnostics](https://github.com/XRPDomains/XahauName/blob/main/docs/READ-API.md#refund-diagnostics).

Use `explainError(error)` for structured `title`, `message`, `stage`, `code` and `recovery` guidance. A timeout after signing means the outcome is unknown; retain the transaction hash and check its validated receipt before retrying. `registrar.reconcile(domain)` is an explicit Invoke for supported lifecycle recovery, not an automatic payment/refund retry. Connection retries apply to reads; the SDK does not silently resubmit writes.

When the integration is disposed, close the shared client:

```ts
await writer.disconnect();
```

## API modules

| Module | Responsibilities | Source |
| --- | --- | --- |
| Verified reads | Named arguments, immutable snapshots and paginated ownership | [src/reads.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/reads.ts) |
| Client | Connection, state reads, verified identity, owned domains and submission | [src/index.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/index.ts) |
| Registrar | Pricing, purchase/claim, offers, burn, metadata and reconciliation | [src/registrar.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/registrar.ts) |
| Resolver | Addresses, texts, profile batches, primary names and content | [src/resolver.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/resolver.ts) |
| Controller | TLDs and registration controls | [src/controller.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/controller.ts) |
| Wallet integration | Signing sessions, fee limits and validated receipt matching | [src/wallet-kit.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/wallet-kit.ts) |
| Record codecs | Human address formats and IPFS content encoding | [src/addresses.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/addresses.ts), [src/content.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/content.ts) |
| Indexed reads | HTTP read client with checkpoint and synchronization metadata | [src/indexer.ts](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/src/indexer.ts) |

[Complete API reference](https://github.com/XRPDomains/XahauName/blob/main/docs/API.md) includes transfer, incoming offers, metadata, custom keys, content records and reconciliation. [XNIP standards](https://github.com/XRPDomains/XahauName/blob/main/docs/standards/README.md) describe shared record conventions; [protocol limits](https://github.com/XRPDomains/XahauName/blob/main/docs/SPEC.md#8-limits-and-migration) define the on-chain bounds.

## Development

From a clone of this repository:

```sh
npm ci
npm run sdk:build
npm run sdk:test
npm run lint --workspace @xahauname/sdk
```

The [domain manager](https://github.com/XRPDomains/XahauName/blob/main/test-app/README.md) demonstrates browser integration with SDK source imports. [Package maintenance](https://github.com/XRPDomains/XahauName/blob/main/packages/sdk/PACKAGE.md) covers exports and distribution; [workspace maintenance](https://github.com/XRPDomains/XahauName/blob/main/docs/PACKAGES.md) covers versions and release commands.
