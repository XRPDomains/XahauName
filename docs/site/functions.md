# SDK function reference

The following are application-facing signatures and result shapes. `client.read` is read-only; `client.registrar` and `client.resolver` writes require a signer. Types below are taken from the SDK source when Docs are generated.

## Read requests

Every read accepts `timeoutMs`, `signal`, `ledgerHash` and `bypassCache` through its request object. Missing data returns `null` where shown; RPC/state/identity failures reject.

```ts
client.read.getOwner({name, ...options}): Promise<string | null>
client.read.getAddress({name, coinType?, ...options}): Promise<string | null>
client.read.getText({name, key, ...options}): Promise<string | null>
client.read.getName({address, name?, ...options}): Promise<string | null>
client.read.getProfile({name, addrs?, texts?, ...options}): Promise<ProfileSnapshot | null>
client.read.getDomain({name, ...options}): Promise<RegistrationStatus>
client.read.getQuote({name, ...options}): Promise<DomainQuote>
client.read.getNames({address, cursor?, limit?, ...options}): Promise<{
  items: OwnedDomainSummary[];
  ledgerHash: string;
  nextCursor: string | null;
  complete: boolean;
  source: 'ledger';
}>
client.read.snapshot(options?): Promise<ReadModule>
```

This block is a signature guide, not executable TypeScript. `coinType` defaults to 21337; `getAddress()` reads an explicit receiving record, while `getOwner()` reads verified custody. `limit` is 1–200 and limits ledger objects, not the number of matching domains.

`name`, `address`, `key`, `cursor` and `ledgerHash` are strings; `coinType`, `limit` and timeout values are numbers. `addresses`/`addrs` are number arrays and `texts` is a string array. An optional `name` in `getName()` supplies a primary candidate to verify, rather than changing the wallet's selection.

## Selected records

`getRecords({name, addresses?, texts?, contentHash?, ...options})` returns a profile projection or null, with:

| Field | Shape / meaning |
| --- | --- |
| `name`, `owner` | Canonical domain and verified wallet address |
| `addresses` | Coin-type keys → decoded `{format: 'address' \| 'hex', value: string}` records |
| `texts` | `Record<string, string>` |
| `unnamedTexts` | Legacy text state-key hex → string |
| `complete` | False for selected records or incomplete legacy key discovery |
| `ledgerHash`, `source` | Pinned ledger hash and `'ledger'` |
| `contentURI`, `contentHash` | When requested: canonical IPFS URI and encoded content-hash hex, or null |

Use both selection arrays to avoid full discovery, with `[]` to skip one category. Maximum selection is 64 record keys.

## Domain write signatures

```ts
writer.registrar.buy({label, tld, recipient?, expectedPriceDrops?}): Promise<TxResult>
writer.registrar.waitForOffer(name, options?): Promise<RegistrationStatus>
writer.registrar.claim(name): Promise<TxResult>
writer.registrar.createTransferOffer(name, recipientAddress): Promise<SignAndSubmitResult>
writer.registrar.cancelTransferOffer(name): Promise<SignAndSubmitResult>
writer.registrar.acceptTransfer(name): Promise<SignAndSubmitResult>
writer.registrar.burn(name): Promise<TxResult>
writer.resolver.setProfile({label, tld, set?, clear?}): Promise<TxResult | null>
writer.resolver.setAddress({label, tld, coinType, address}): Promise<TxResult>
writer.resolver.clearAddr({label, tld, coinType}): Promise<TxResult>
writer.resolver.setText({label, tld, key, value}): Promise<TxResult>
writer.resolver.clearText({label, tld, key}): Promise<TxResult>
writer.resolver.setPrimary({label, tld, flag}): Promise<TxResult>
writer.resolver.reset({label, tld}): Promise<TxResult>
```

`setProfile.set` is a partial map of the ten Global Keys; `clear` lists explicit removals. An unchanged patch returns null without signing. Address codecs use chain-specific formats. `recipientAddress` is a classic wallet address; resolve a domain's owner first if your UI accepts a domain.

`expectedPriceDrops` is an optional bigint binding the payment to the approved quote. A mismatch raises `PRICE_CHANGED` before signing. Write name components, keys, values and addresses are strings; `coinType` is a number and `flag` is boolean. Wait options are `{timeoutMs?: number, pollIntervalMs?: number, signal?: AbortSignal}`. Price values are `bigint` drop amounts, never floating-point XAH.

## Treasury and reconciliation

Treasury operations include `registrar.register({label, tld, recipient, paymentDestination?})`, `registrar.setPricing(bigint[10])`, `registrar.setURIBase(base)`, `controller.addTld(tld)`, `removeTld(tld)`, `pause()` and `unpause()`. They require treasury signing authority.

For eligible lifecycle repair, `registrar.reconcile(name)` submits opcode 17; inspect the domain/journal first. It cannot settle refund obligations. `getRefundStatus(name)` is diagnostic and never retries a refund.

## Source-backed result types

These excerpts are generated from exported interfaces in `packages/sdk/src/types.ts`; `Buffer` is a binary value, not JSON. Serialize `bigint` values as decimal strings when crossing a JSON boundary.

{{sdk_types}}

For direct integration without XahauName SDK, use [Hook & raw operations](hook.md). The [full protocol](../SPEC.md) defines permissions and wire bytes.
