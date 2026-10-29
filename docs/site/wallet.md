# Wallet integration

Wallet Kit manages sessions and wallet consent. XahauName SDK encodes domain operations and checks validated results. The browser app never needs a seed.

## Connect, bind and sign

The example assumes your Wallet Kit instance is already configured for Xahau and exposes its connected `manager`. Mount/connect Kit first, then bind the signer:

```ts
import {
  XahauNameClient, resolveNetworkConfig, XAHAU_NETWORKS,
  createWalletKitSigner,
} from '@xahauname/sdk';

const network = XAHAU_NETWORKS.testnet;
const config = resolveNetworkConfig({network: 'testnet'});
const client = new XahauNameClient(config);
await client.connect();

const account = manager.getAccount();
if (!account || manager.getNetwork()?.id !== network.walletKitId) {
  throw new Error('Connect the intended wallet on Xahau Testnet');
}
const signer = createWalletKitSigner(manager, client.rawClient, {
  network: network.walletKitId,
  networkId: network.networkId,
  maxFeeDrops: '1000000',
  feePreparation: 'wallet-kit',
  onSubmitted: hash => console.log('Save transaction hash:', hash),
});
client.setSigner(signer);
await client.resolver.setText({
  label: 'alice', tld: 'xah', key: 'description', value: 'Hello Xahau',
}); // the connected account must own alice.xah
```

Use `feePreparation: 'wallet-kit'` only with a real manager that enforces `maxFeeDrops`. Otherwise keep the default SDK preparation with a connected RPC client exposing `autofill()`. The cap is a safety ceiling, not an estimate of the actual fee.

## Session lifecycle

On disconnect call `client.setSigner(null)`. On account/network change clear the signer, verify the new session, and create a new signer before another write. Disconnect the client when the application session ends.

Keep a single transport where possible. The domain manager disables duplicate Kit confirmation polling because the SDK owns validated-receipt checks. This does not disable network, account, fee or transaction-intent verification.

## Consent and uncertainty

Buying and claiming require separate approvals. Declining claim leaves a claimable name; it does not authorize a second purchase. Persist submitted hashes even if a later wallet check fails. A confirmation timeout needs a receipt lookup, not automatic resubmission.

Xaman's client ID is public configuration; wallet secrets are not. For server hosting, use HTTPS and configure the allowed origin/redirect with the wallet provider.

See the [Wallet Kit Xahau configuration](https://xrpdomains.xyz/xrpl-wallet-kit/docs/configuration/xahau.html) and the [working app integration](https://github.com/XRPDomains/XahauName/blob/main/test-app/src/wallet-signer.ts).
