# Hook & raw operations

You can read and verify XahauName directly through Xahau RPC, without `@xahauname/sdk`. Writes are native transactions with the protocol's exact bytes. The hook itself enforces authority and bounds.

## Entry points and C functions

`hook(uint32_t ctx)` is the transaction entry point in each handler. Issuance also exports `cbak(uint32_t reason)` for emitted-transaction callbacks. The callback reason is **not** an engine result; the handler inspects transaction/metadata slots.

Functions such as `do_set_primary` and `make_root_key` are internal C helpers. They are not RPC methods. A read does not execute them; derive their documented state keys and query the ledger. The following table is rendered from the hook function reference:

{{hook_functions}}

## Routing and byte encoding

Use the [deployment](deployment.md) treasury, namespace and hook hashes for the selected network. All operation transactions include native `HookParameters` named `xn_v` and `op`.

- `xn_v` is raw byte `02`; `op` is one raw opcode byte, not its ASCII digits.
- JSON `HookParameterName` and `HookParameterValue` are hexadecimal encodings of their bytes.
- Names/values are encoded once at the JSON boundary. A field defined as ASCII hex has an additional inner text encoding by design.
- Buyer Payment goes to treasury. Ordinary record Invoke goes to treasury. Treasury self-Invoke **omits Destination**. Administrative register is a treasury-originated Payment to a distinct payment destination.
- A raw transaction also needs the correct `Account`, `NetworkID`, current fee, sequence and expiry from a wallet or maintained Xahau transaction library. These examples are unsigned; do not submit placeholder accounts.

## Operation table

These opcode numbers and permissions come from the authoritative SPEC:

{{operations}}

Native claim uses `URITokenBuy`, owner transfer uses `URITokenCreateSellOffer` with `Amount: "0"` and restricted `Destination`, cancellation uses `URITokenCancelSellOffer`, and burn uses `URITokenBurn`. They are not Invoke opcodes. A recognized domain cannot bypass cleanup with Remit.

## Parameter layouts

| Parameter | Decoded value before JSON hex encoding |
| --- | --- |
| `label`, `tld` | Canonical ASCII name components, without a dot |
| `flag` | One byte `00` or `01` |
| `coinType` | Exactly four bytes, unsigned big-endian; current range 0–65535 |
| `addr` | ASCII hex representing the chain-specific address bytes; 1–128 decoded bytes |
| `recipient` | 40 ASCII hex characters representing a decoded 20-byte AccountID; not a classic `r...` string |
| `key`, `value` | Text-key bytes and 1–128 value bytes; key normalization/bounds follow SPEC |
| `prices` | Ten consecutive uint64 big-endian drop amounts, exactly 80 bytes |
| `uri_base` | HTTPS base with trailing slash, at most 120 ASCII bytes; future mints only |
| `token` | Raw 32-byte token ID for reconciliation, not 64 ASCII hex characters |
| `profile` | Five bytes: version, uint16 set mask, uint16 clear mask; all integers big-endian |
| `p0`…`p9` | Value bytes only for set bits in a profile batch |

Profile version 2 order is avatar, description, display, email, keywords, mail, notice, location, phone, url. Masks must be nonempty, disjoint and use only ten bits. For example, set description and clear notice with header `0200020040` and `p1` containing the new description. Never mix the batch with ordinary `key`/`value` parameters.

## Example: unsigned setText Invoke

This sets `alice.xah`'s description to `Hello`. The caller must own the domain. Fill transaction identity, fee, sequence and expiry before wallet signing.

```json
{
  "TransactionType": "Invoke",
  "Account": "OWNER_WALLET_ADDRESS",
  "Destination": "TREASURY_ADDRESS",
  "NetworkID": 21338,
  "HookParameters": [
    {"HookParameter": {"HookParameterName": "786E5F76", "HookParameterValue": "02"}},
    {"HookParameter": {"HookParameterName": "6F70", "HookParameterValue": "06"}},
    {"HookParameter": {"HookParameterName": "6C6162656C", "HookParameterValue": "616C696365"}},
    {"HookParameter": {"HookParameterName": "746C64", "HookParameterValue": "786168"}},
    {"HookParameter": {"HookParameterName": "6B6579", "HookParameterValue": "6465736372697074696F6E"}},
    {"HookParameter": {"HookParameterName": "76616C7565", "HookParameterValue": "48656C6C6F"}}
  ]
}
```

Raw purchase is a native-XAH Payment with opcode 2, label/TLD and the exact current price in `Amount` drops. Read `_pricing_v1` at a validated ledger; tiers cover lengths 1–9 and 10+. Partial Payments and issued currencies reject. Do not repeat a purchase because mint/offer/claim is still pending.

## Derive and read state keys

`H` means the first 32 bytes of SHA-512 over the exact bytes, without a NUL terminator. Keys are scoped by treasury and namespace. No XahauName SDK is required:

```js
import {createHash} from 'node:crypto';
const H = bytes => createHash('sha512').update(bytes).digest().subarray(0, 32);
const rootKey = H(Buffer.from('alice.xah:root')).toString('hex').toUpperCase();
const textKey = H(Buffer.from('alice.xah:text:description')).toString('hex').toUpperCase();
const addrKey = H(Buffer.from('alice.xah:addr:21337')).toString('hex').toUpperCase();
```

Notice that the coin type in the **state-key preimage** is decimal text, while its **transaction parameter** is uint32 big-endian. Primary reverse keys hash `primary_of:` followed by binary AccountID20, not the classic address text.

{{state_table}}

Pin a validated ledger hash, then send this WebSocket RPC request; replace the placeholders with derived/configured hex values:

```json
{
  "command": "ledger_entry",
  "hook_state": {
    "account": "TREASURY_ADDRESS",
    "namespace_id": "NAMESPACE_HEX64",
    "key": "DERIVED_STATE_KEY_HEX64"
  },
  "ledger_hash": "VALIDATED_LEDGER_HASH"
}
```

Decode `result.node.HookStateData` from hex. Root is exactly 32 bytes: owner AccountID at 0–19, flags at 20, mintedAt uint64 BE at 21–28 and padding at 29–31. Time uses the Ripple epoch (2000-01-01); add 946684800 for Unix seconds. Primary is flag bit 0; the legacy lock bit has no authority.

Use `account_namespace` with `account`, `namespace_id` and the same `ledger_hash` to enumerate records; follow markers unchanged. Missing state is not a network error. `HookStateKey` is the application key; the object's ledger `index` is a different identifier.

## Verify owner without the SDK

Read the root, full domain-to-token mapping, reverse name and native token at the same ledger. Confirm issuer, exact URI-derived token ID and equality between root owner and native Owner. Stop if there is a recovery journal or unresolved registration tracking. Never infer an ID from the latest URI base.

The [read-only verification script](../examples/verify-domain.mjs) uses Node crypto and the generic `xahau` RPC/address codec library. It imports no XahauName SDK, never signs and never fetches metadata:

```sh
# Run from the repository after npm ci
node docs/examples/verify-domain.mjs web3domains.xah
# Optional: another explicit public deployment manifest
node docs/examples/verify-domain.mjs alice.xah /path/to/public-deployment.json
```

The default reads the repository's testnet manifest. If downloading the script separately, pass the manifest path and install the generic `xahau` library. A missing finalized root does not prove availability; pending registrations can reserve a name. This example deliberately refuses missing full-ID mappings rather than guessing legacy identity.

## Validate a write independently

Fetch `tx` by hash. Require `validated: true`, the expected engine result, treasury execution account and the intended handler's configured HookHash. Decode `HookReturnString` from hex. Parse `HookReturnCode` as the hexadecimal integer field, not a decimal string.

For setText expect the set-text handler's code 0 and `text set`. Other handlers may return code 0 with `next`, `not v2` or other pass-through messages; that does not prove the requested operation ran. Check the resulting state and native token. For emitted workflows, inspect child transactions/callbacks and final lifecycle state as well.

A weak cleanup rejection cannot undo a native claim/burn. See [errors and recovery](errors.md), the [full protocol](../SPEC.md), and official [HookState enumeration](https://xahau.network/docs/hooks/functions/websocket-apis/account_namespace/).
