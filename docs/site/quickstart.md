# SDK quickstart

Use the repository workspace for this testnet release. Package names below refer to the local workspace; this guide does not assume an npm publication.

## Set up

Node.js 20+ is required. From the repository root:

```sh
npm ci
npm run sdk:build
npm run app:dev
```

## Read without a wallet

```ts
import {XahauNameClient, resolveNetworkConfig} from '@xahauname/sdk';

const config = resolveNetworkConfig({network: 'testnet'});
const client = new XahauNameClient(config);
try {
  const owner = await client.read.getOwner({name: 'alice.xah'});
  console.log(owner); // wallet address, or null
} finally {
  await client.disconnect();
}
```

Reads connect on demand. Missing records return `null`; network failures and invalid ownership reject the promise.

## Add a wallet signer

After Wallet Kit connects a wallet to the selected network:

```ts
import {createWalletKitSigner, XAHAU_NETWORKS} from '@xahauname/sdk';

const network = XAHAU_NETWORKS.testnet;
await client.connect(); // reconnect if the read-only example has disconnected
const signer = createWalletKitSigner(manager, client.rawClient, {
  network: network.walletKitId,
  networkId: network.networkId,
  maxFeeDrops: '1000000',
});
const writer = new XahauNameClient({...config, signer});
await writer.connect();
// Use writer.registrar or writer.resolver, then disconnect when done.
// await writer.disconnect(); await client.disconnect();
```

`manager` is your connected Wallet Kit session manager. Keep client configuration in scope and disconnect only after your application's read/write session ends. The fee limit above is an application cap, not a quoted transaction fee. Browser applications must not collect wallet seeds.

Next: [read functions](read.md), [write functions](write.md), or [wallet integration](wallet.md).

## Cookbook: buy, claim, publish

With the [wallet signer](wallet.md) connected, use this resumable flow. Let the user choose an available name; `alice.xah` is an example, not an availability guarantee.

```ts
const name = 'alice.xah';
const status = await writer.read.getDomain({name, bypassCache: true});
if (status.stage === 'available') {
  const purchase = await writer.registrar.buy({label: 'alice', tld: 'xah'});
  console.log('Persist purchase hash before waiting:', purchase.txHash);
  await writer.registrar.waitForOffer(name);
  await writer.registrar.claim(name); // separate wallet approval
} else if (status.stage === 'awaitingClaim') {
  await writer.registrar.claim(name); // verifies the intended recipient
} else if (status.stage !== 'claimed') {
  throw new Error('Check registration status before any new payment');
}

await writer.resolver.setProfile({
  label: 'alice', tld: 'xah',
  set: {display: 'Alice Smith', description: 'Building on Xahau'},
}); // owner-only; one approval, other records retained
const saved = await writer.read.getProfile({name, bypassCache: true});
console.log(saved?.profile.texts);
```

On any rejection or timeout, stop this flow and inspect status. If purchase succeeded but claim was declined, the next run uses the claim branch rather than paying again. A claimed name can be edited only by its current verified owner. See [errors and reliability](errors.md).
