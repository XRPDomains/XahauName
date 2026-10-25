# Explorer manifests

Generate XahauWin HookState ABIs and metadata for the installed XahauName chain. The generator is read-only: it has no wallet, signing, submission or explorer publication path.

## Prepare and generate

From the repository root, with dependencies installed:

```sh
node packages/sdk/scripts/build.mjs
node scripts/explorer/prepare.mjs
node scripts/explorer/build.mjs --network testnet --out hook/build/current/explorer-testnet
node --test scripts/explorer/projections.test.mjs
```

Preparation downloads the [upstream skill](https://github.com/XRPLWin/xahau-hooks-abi-skill) at commit `9e0eed4830535ed6b288820fb6aa116e0fd9844e`, with its MIT license, format reference, unchanged decoder, coverage checker and validator. `npm ci --ignore-scripts` installs its isolated locked dependencies under ignored `hook/build/current/explorer-toolchain/`. The root package lock and installed skills are untouched. Subsequent runs verify cached source checksums. Upstream parser/validator files are never patched.

Network/deployment selection uses the SDK's shared configuration. Testnet reads `deployments/testnet.json`; mainnet requires its own manifest or explicit `--deployment <file>`. Optional `--wss` changes transport, never deployment identity. The process verifies network, installed HookHashes/order and effective namespaces before reading a single pinned validated ledger. No testnet account or catalog is implicitly used on mainnet.

The current generator requires the account's namespace inventory to contain only the selected XahauName namespace. Additional/foreign namespaces stop generation until their layouts and the explorer's cross-hook fallback rules have been inventoried; they are not silently omitted from a complete-coverage claim.

Outputs:

| File | Purpose |
| --- | --- |
| `<handler>.abi.json` | Bare projection array for the explorer ABI editor; ten files |
| `<handler>.manifest.json` | Name, description, README, publisher, namespace and ABI; ten files |
| `snapshot.json`, `state.json` | Pinned deployment identity and raw public state |
| `check.json` | Complete chain coverage input, including clearly marked synthetic fixtures |
| `coverage.log`, `*.validate.log` | Output from the unchanged upstream CLI tools |
| `verification.json` | Counts, hash identity, schema/tool revisions and verification result |
| `PUBLISHING.md` | Network-specific manual review/publication steps |

An existing output folder starts each generation with `verification.json` marked `NOT_VERIFIED`. Only a completed check/validation run writes `PASS`. Never publish a folder whose last verification is not `PASS`.

## Scope: snapshot-bound exact selectors

Most XahauName keys are SHA-512Half of a domain/record preimage. This explorer format cannot reverse hashes, join records or call the SDK. The generator therefore uses exact state-key selectors, partitioned among logical ABI owners across the ten hooks. It never guesses that an arbitrary 32-byte value is a root, token ID or primary map. A record kind appears in one hook's manifest even when several handlers write it.

Every entry in the named snapshot must decode exactly once across the complete chain; unknown, ambiguous or malformed state stops generation. Every generated projection is exercised by a real entry or an explicitly synthetic source-layout fixture. Synthetic entries are not claimed as ledger data and are not published as state.

These manifests are **not universal coverage for future states**. Adding a domain/key, changing an address length or upgrading legacy custom descriptors can require regeneration even under the same HookHash. Each hook manifest is limited to 200 projections and 256 KiB; this exact-key approach deliberately stops when those limits are exceeded. SDK/indexer discovery is the appropriate application interface for large collections. No key-layout migration or extra on-chain mirror is introduced for the explorer.

## Catalog and unknown hashes

`catalog.<network>.json`, when present, supplies known TLDs, extra domain/owner preimages and custom text names for that network. Otherwise the shared `catalog.json` is used. `--catalog <file>` explicitly selects a deployment's catalog. Optional `coinTypes` adds known coin types to lookup. Domain reverse maps, root owners, record inventories and custom slots supply most preimages automatically.

The testnet catalog includes three old disabled-TLD tombstones. Their names were recovered from each HookState's `PreviousTxnID` and the validated `removeTld` transaction; evidence is in [catalog.testnet.json](catalog.testnet.json). These are real historical state, not invented names or records to delete. For an unknown hash, inspect its original transaction/source or supply a proven preimage; do not add a broad decoder by value length to force coverage.

For offline reproducibility:

```sh
node scripts/explorer/build.mjs --network testnet \
  --snapshot hook/build/current/explorer-testnet/snapshot.json \
  --out hook/build/current/explorer-testnet
```

The input snapshot must match the selected network, treasury, namespace, installed hook hashes and effective namespaces. Its ledger/hash are retained in every verification report. A saved snapshot proves that snapshot only, not current chain state.

## Shared layout and publication

[State layouts](../protocol/state-layouts.json) define field sizes, offsets, byte order, epoch and logical ABI owners. The [schema synchronizer](../scripts/sync-protocol.mjs) verifies C constants and generates SDK layout constants used by the SDK/indexer and explorer. Root times are `UInt64 BE` seconds since 2000-01-01, not the explorer's four-byte `Timestamp`. Paid drops are plain `UInt64 BE`, flags remain integers, and address bytes remain explicitly raw until decoded with a coin-specific SDK codec.

No SetHook/redeployment is needed to add explorer metadata. Inspect the generated bundle and use the explorer's Namespace edit dialog, signing in with your own Google or Xaman account as described by [upstream publishing instructions](https://github.com/XRPLWin/xahau-hooks-abi-skill/blob/9e0eed4830535ed6b288820fb6aa116e0fd9844e/reference/publishing.md). A new HookHash needs rechecked metadata for that build. Testnet/mainnet explorers have separate manifest stores. The generator does not authenticate, upload or publish on your behalf.
