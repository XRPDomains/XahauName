# Read functions

Use `client.read` for validated, native-verified reads. These methods do not need a signer and do not submit transactions.

## Choose the right read

| Method | Result / purpose |
| --- | --- |
| `getOwner({name})` | Verified current owner; use for transferring a domain to another domain's owner |
| `getAddress({name, coinType})` | Explicit receiving record; defaults to XAH 21337; no owner fallback |
| `getName({address, name?})` | Forward-confirmed primary name or null |
| `getText({name, key})` | One UTF-8 text record or null |
| `getRecords({name, addresses?, texts?})` | Selected or discovered profile records |
| `getProfile({name})` | Verified profile, token identity/URI and transfer offer; no metadata HTTP request |
| `getNames({address, cursor?, limit?})` | One page of owned-domain summaries and a continuation cursor |
| `getDomain({name})` | Registration, claim, refund or recovery stage |
| `getQuote({name})` | Price in drops, TLD availability and lifecycle status at one ledger |

## Share one validated ledger

```ts
const snapshot = await client.read.snapshot();
const [owner, records] = await Promise.all([
  snapshot.getOwner({name: 'alice.xah'}),
  snapshot.getRecords({
    name: 'alice.xah',
    addresses: [0, 60, 21337],
    texts: ['display', 'description', 'url'],
  }),
]);
```

Create a new snapshot after a write or refresh. An existing snapshot intentionally keeps its original ledger. Supplying both selection arrays avoids full record discovery; use `[]` to skip a category.

## Missing data and pagination

`getOwner()` returning `null` means there is no finalized domain root in that snapshot. `getAddress()` returning `null` does not mean the domain is unowned: its receiving record may simply be absent.

Follow `nextCursor` until null when listing names. A page can contain zero recognized domains and still have a cursor because pagination counts ledger objects.

Read options include `bypassCache`, `timeoutMs`, `signal` and `ledgerHash`. A timeout is not proof of missing data. See the [function signatures and result types](functions.md) or [errors and reliability](errors.md).
