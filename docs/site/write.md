# Write functions

Writes need a connected signer, the correct network and enough XAH for the transaction and applicable reserves. Domain mutations require the verified owner; registrar settings require treasury authority.

## Domain lifecycle

| SDK method | Action |
| --- | --- |
| `registrar.buy({label, tld})` | Pay the quoted price and start minting |
| `registrar.register({label, tld, recipient})` | Treasury-only administrative registration |
| `registrar.waitForOffer(name)` | Wait for a registration offer |
| `registrar.claim(name)` | Sign the registration claim |
| `registrar.claimIncoming(name)` | Claim a verified incoming registration or transfer |
| `registrar.createTransferOffer(name, address)` | Create a restricted zero-price transfer offer |
| `registrar.cancelTransferOffer(name)` | Cancel the current owner's offer |
| `registrar.acceptTransfer(name)` | Accept a free offer addressed to the signer |
| `registrar.burn(name)` | Permanently burn an owned domain |

```ts
const name = 'alice.xah';
const purchase = await writer.registrar.buy({label: 'alice', tld: 'xah'});
// Persist purchase.txHash before waiting; never repay after an uncertain timeout.
await writer.registrar.waitForOffer(name);
const claim = await writer.registrar.claim(name);
```

Purchase and claim are separate approvals. Transfer records remain until the recipient claims; acceptance clears prior addresses, texts, custom keys, content and primary. Burn removes identity and records.

## Profile and records

```ts
await writer.resolver.setProfile({
  label: 'alice', tld: 'xah',
  set: {display: 'Alice Smith', description: 'Building on Xahau'},
  clear: ['notice'],
}); // one atomic Invoke; unchanged fields are left alone

await writer.resolver.setText({
  label: 'alice', tld: 'xah', key: 'com.github', value: 'alice',
});
await writer.resolver.setAddress({
  label: 'alice', tld: 'xah', coinType: 21337, address: ownerAddress,
});
await writer.resolver.setPrimary({label: 'alice', tld: 'xah', flag: true});
```

`ownerAddress` is a valid Xahau wallet address. Use `clearText`, `clearAddr` or `setProfile.clear` for explicit removals. `reset({label, tld})` clears a profile while retaining ownership.

## Handle outcomes

Persist transaction hashes and inspect validated results. A submission/confirmation timeout has an unknown outcome; check status before retrying. `refundPending` and `recoveryRequired` are not permission to pay again. Catch errors with `explainError(error)` for stage and recovery guidance.

See the [SDK function reference](functions.md) for argument/result shapes, or [Hook & raw operations](hook.md) to construct and verify transactions without XahauName SDK.
