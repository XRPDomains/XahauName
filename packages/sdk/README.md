# @xahauname/sdk

The TypeScript client for XahauName. Resolve on-chain names and profiles, manage domain ownership and records, integrate wallet signing, and consume indexed application data through one API.

The SDK provides a client, registrar and resolver modules, address/content codecs, typed profile conventions, transaction confirmation and Wallet Kit integration. It exports CommonJS, ESM and TypeScript declarations for Node.js 20+ and browser bundlers.

## Quickstart

From the repository root:

```sh
npm ci
npm run sdk:build
```

```ts
import {XahauNameClient, resolveNetworkConfig} from '@xahauname/sdk';

const config = resolveNetworkConfig({network: 'testnet'});
const reader = new XahauNameClient(config);
await reader.connect();

try {
  const domain = 'alice.xah';
  const profile = await reader.describe(domain);
  const owner = await reader.getOwner(domain);
  const receivingAddress = await reader.resolver.resolveAddress(domain, 21337);
  const ownedDomains = owner ? await reader.listOwnedDomains(owner) : [];
  const primary = owner ? await reader.getVerifiedPrimaryName(owner) : null;

  console.log({profile, owner, receivingAddress, ownedDomains, primary});
} finally {
  await reader.disconnect();
}
```

Public owner/profile reads verify native token identity. A receiving address is an explicit record, separate from the owner. `getVerifiedPrimaryName()` checks that the configured primary's native receiving record resolves back to the wallet.

For list and search screens, the SDK provides combined reads:

```ts
await reader.connect();
try {
  const quote = await reader.checkDomain('alice.xah');
  console.log(quote.status.stage, quote.priceDrops, quote.tldEnabled);
  const owner = await reader.getOwner('alice.xah');
  if (owner) {
    const portfolio = await reader.getPortfolio(owner);
    console.log(portfolio.domains, portfolio.primary, portfolio.ledgerHash);
  }
} finally {
  await reader.disconnect();
}
```

Each combined read uses one validated ledger. `getPortfolio()` returns verified token URIs alongside domain names; load incoming offers independently so history scanning does not delay the owned list.

The network in this example selects the bundled deployment. To use another deployment or network, supply its public treasury, namespace and hook hashes through [shared network configuration](../../docs/NETWORKS.md).

For a complete runnable program, see [read-profile.mjs](../../docs/examples/read-profile.mjs), which pins profile, portfolio and primary reads to one validated ledger. [Example setup](../../docs/examples/README.md) describes its network configuration.

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

const writer = new XahauNameClient({...config, signer});
await writer.connect();
```

Use the same selected network for the wallet and deployment. Other integrations can provide the SDK's `TxSigner` contract. See [wallet integration](../../docs/WALLET-INTEGRATION.md) for session lifecycle, fee preparation and validated receipts.

## Register and manage a profile

With a connected `writer` and its `signer` from the previous example:

```ts
await writer.registrar.buyAndClaim({label: 'example', tld: 'xah'});

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

Purchase and claim are separate wallet approvals; `buyAndClaim()` coordinates them. A profile batch uses one Invoke/signature, while an unchanged patch returns null. Transfer acceptance clears the prior owner's records and primary selection.

When the integration is disposed, close both client connections:

```ts
await writer.disconnect();
await reader.disconnect();
```

## API modules

| Module | Responsibilities | Source |
| --- | --- | --- |
| Client | Connection, state reads, verified identity, owned domains and submission | [src/index.ts](src/index.ts) |
| Registrar | Pricing, purchase/claim, offers, burn, metadata and reconciliation | [src/registrar.ts](src/registrar.ts) |
| Resolver | Addresses, texts, profile batches, primary names and content | [src/resolver.ts](src/resolver.ts) |
| Controller | TLDs and registration controls | [src/controller.ts](src/controller.ts) |
| Wallet integration | Signing sessions, fee limits and validated receipt matching | [src/wallet-kit.ts](src/wallet-kit.ts) |
| Record codecs | Human address formats and IPFS content encoding | [src/addresses.ts](src/addresses.ts), [src/content.ts](src/content.ts) |
| Indexed reads | HTTP read client with checkpoint and synchronization metadata | [src/indexer.ts](src/indexer.ts) |

[Complete API reference](../../docs/API.md) includes transfer, incoming offers, metadata, custom keys, content records and reconciliation. [XNIP standards](../../docs/standards/README.md) describe shared record conventions; [protocol limits](../../docs/SPEC.md#8-limits-and-migration) define the on-chain bounds.

## Development

```sh
npm run sdk:test
npm run lint --workspace @xahauname/sdk
```

The [domain manager](../../test-app/README.md) demonstrates browser integration with SDK source imports. [Package maintenance](PACKAGE.md) covers exports and distribution; [workspace maintenance](../../docs/PACKAGES.md) covers versions and release commands.
