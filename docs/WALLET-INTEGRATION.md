# Wallet integration

The SDK accepts a structural TxSigner with address and signAndSubmit(tx). The result must contain hash, validated=true, engineResult and metadata from the validated ledger. A provider acknowledgement or provisional tesSUCCESS is insufficient.

## Wallet Kit

Use the [Wallet Kit Xahau configuration](https://xrpdomains.xyz/xrpl-wallet-kit/docs/configuration/xahau.html). The test app uses client 0.2.1 with Xahau Testnet, autoReconnect, persisted session, default theme accent and validated total XAH balance from the SDK WebSocket transport. Balance is not spendable balance.

```ts
import {XahauNameClient, TESTNET, createWalletKitSigner} from '@xahauname/sdk';
const signer = createWalletKitSigner(manager, rpc, {
  network: 'xahau-testnet', networkId: 21338, maxFeeDrops: '1000000',
  onSubmitted: hash => console.log(hash),
});
const names = new XahauNameClient({...TESTNET, signer});
await names.connect();
```

manager is an already connected Kit session; rpc is a connected Xahau client exposing request(). Capture account/network before signing, recheck immediately before each request and recreate signer after session changes. The helper caps fees, waits for validation and compares requested transaction fields with the actual ledger transaction. LastLedgerSequence may be refreshed by the provider; destination, amount, parameters and signing identity may not change.

Mint purchase and claim are separate consent events. buyAndClaim queues the second wallet request after offer confirmation; declining leaves a claimable incoming domain. UI also lists restricted transfer offers received by the connected account. Unknown outcomes preserve the transaction hash and require lookup before retrying.

No seed is requested/stored by the web app. Xaman client ID is public configuration, not a signing credential. Treasury signing is separate from end-user browser integration.

## Suggested Kit improvements

These are integration recommendations, not claims about missing features in every adapter:

- Expose one normalized account/network lifecycle and declared support for Invoke, HookParameters and URIToken transactions.
- Return validated result metadata or a consistent pending hash contract, avoiding adapter-specific result shapes.
- Permit an injected balance/RPC transport with total/reserve/spendable clearly distinguished.
- Surface account/network changes, reconnect state, user cancellation and unknown submission outcomes consistently.
- Keep sequential purchase/claim signatures explicit; never combine them by hiding recipient authorization.

All domain operations and read-only resolution belong in XahauName SDK. Kit should manage wallet lifecycle and signing rather than embed domain storage rules.
