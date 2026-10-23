# Wallet integration

The SDK accepts a structural TxSigner with address and signAndSubmit(tx). The result must contain txHash, validated=true, engineResult and metadata from the validated ledger. Wallet signing and domain operations have separate responsibilities: the signer authorizes a transaction, while the SDK encodes and verifies its domain operation.

## Wallet Kit

Use the [Wallet Kit Xahau configuration](https://xrpdomains.xyz/xrpl-wallet-kit/docs/configuration/xahau.html). The [domain manager](../test-app/README.md) demonstrates autoReconnect, persisted sessions, default theme accent and validated total XAH balance from SDK transport. Select the wallet network and deployment together using [shared configuration](NETWORKS.md). Total balance is distinct from spendable balance.

```ts
import {XahauNameClient, TESTNET, createWalletKitSigner} from '@xahauname/sdk';
const signer = createWalletKitSigner(manager, rpc, {
  network: 'xahau-testnet', networkId: 21338, maxFeeDrops: '1000000',
  onSubmitted: hash => console.log(hash),
});
const names = new XahauNameClient({...TESTNET, signer});
await names.connect();
```

manager is an already connected Kit session; rpc is a connected Xahau client exposing request() and autofill(). The helper prepares missing Fee before opening the signing request; a request-only RPC must instead receive transactions with an explicit Fee. Capture account/network before signing and recreate the signer after session changes. The helper caps fees, waits for validation and compares transaction intent with the actual ledger transaction.

Fee estimation does not define the wallet's signing context. The helper forwards the caller's transaction plus the checked `Fee`, and passes `maxFeeDrops` explicitly to the manager. Wallet Kit prepares missing `Sequence`, `Flags` and `LastLedgerSequence`, accounting for the current transaction queue and verifying permitted expiry extensions against the trusted ledger window. Explicit caller-supplied fields remain exact, including in the validated receipt. Destination, amount, parameters, fees and signing identity may not change. Verification failures never cause an automatic resubmission.

With a real Wallet Kit manager that enforces `maxFeeDrops`, use `feePreparation: 'wallet-kit'` to avoid a second SDK autofill pass. The SDK still checks an explicit fee before signing and the actual fee in the validated receipt. The default `sdk` mode retains independent fee preparation for other integrations.

The domain manager uses one connected SDK client and `setSigner(signer | null)` when the wallet session changes. SDK receipt polling owns confirmation; Kit's duplicate `transactionConfirmation` and `accountStatus` requests are disabled in this app. Its validated callback updates Kit's transaction history. Kit's checks of RPC network identity, signing intent, current sequence, fee and expiry remain enabled. Observer callbacks cannot interrupt confirmation processing.

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
