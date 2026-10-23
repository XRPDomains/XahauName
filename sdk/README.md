# @xahauname/sdk

Use `resolveNetworkConfig({network: 'testnet'})` for the reviewed deployment. Mainnet uses the same API with its own explicit deployment; see [network configuration](../docs/NETWORKS.md). Optional `IndexerReadClient` reads the [indexer HTTP API](../indexer/README.md) and retains checkpoint/lag; transaction submission and critical verification stay ledger-backed.

Release 0.3.0 for the native ten-handler XahauName protocol. Requires Node.js 20+ or a modern browser bundler. Uses xahau 4.2.0. [Complete API](../docs/API.md), [protocol](../docs/SPEC.md), [wallet integration](../docs/WALLET-INTEGRATION.md).

## Build

```sh
npm ci
npm run build
npm test
```

Exports CommonJS, ESM and declarations. The browser app bundles the ESM/source entry; a separate IIFE is not needed for that integration. No npm publish is performed by build.

## Read a profile

```ts
import {XahauNameClient, TESTNET} from '@xahauname/sdk';
const client = new XahauNameClient(TESTNET);
await client.connect();
try {
  const profile = await client.describe('alice.xah', {verifyOwner: true});
  const owner = await client.getOwner('alice.xah');
  const address = await client.resolver.resolveAddress('alice.xah', 21337);
  const domains = owner ? await client.listOwnedDomains(owner) : [];
  const primary = owner ? await client.getVerifiedPrimaryName(owner) : null;
  console.log({profile, owner, address, domains, primary});
} finally { await client.disconnect(); }
```

Owner is identity, receiving address is an explicit record. The deprecated resolve helper returns owner for compatibility; do not use it as a receiving-address resolver. Missing records return null; addr/text convenience facades return empty bytes/string.

## Write with a disposable testnet wallet

```ts
import {Wallet} from 'xahau';
const client = new XahauNameClient({...TESTNET,
  wallet: Wallet.fromSeed(process.env.TESTNET_SEED!)});
await client.connect();
try {
  const result = await client.registrar.buyAndClaim({label: 'example', tld: 'xah'});
  await client.resolver.setProfile({label: 'example', tld: 'xah',
    set: {description: 'My profile', url: 'https://example.com'}});
  await client.resolver.setAddress({label: 'example', tld: 'xah',
    coinType: 21337, address: client.signerAddress!});
  console.log(result);
} finally { await client.disconnect(); }
```

Browser users should use createWalletKitSigner rather than wallet seeds. Purchase and claim require two signatures; buyAndClaim orchestrates them but cannot bypass recipient consent. Profile batch uses one Invoke/signature. A no-change profile patch returns null.

## Compatibility

Native marker 2 is separate from package version. Profile batch2 uses the ten ENS Global Keys; batch1 remains readable by the hook. Owner locks are retired. uint 16 coin IDs, fifteen addresses/texts and 128-byte values remain bounded. Content URI is stored in text, with SDK IPFS/ENSIP-7 conversion. No high-bit ENSIP-11 IDs or full ENS ABI support is claimed.

TESTNET contains verified public deployment hashes; use a reviewed explicit configuration for another deployment. No mainnet preset is supplied. Credentials and local receipts are excluded from package files.
