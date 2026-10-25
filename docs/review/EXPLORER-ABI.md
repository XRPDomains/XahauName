# Explorer ABI preparation

Date: 2026-10-25. Source skill: XRPLWin/xahau-hooks-abi-skill, pinned commit `9e0eed4830535ed6b288820fb6aa116e0fd9844e`. The unchanged upstream parser/checker/validator runs with its own locked dependencies in ignored local tooling storage.

The [explorer tooling](../../explorer/README.md) produces ten `.abi.json` arrays and ten full `.manifest.json` files for the installed chain. Binary [state layouts](../../protocol/state-layouts.json) are shared with generated SDK constants used by root/pricing/pending decoders and indexer projection. C macro and source-hash checks confirmed that all ten installed artifact sources remain unchanged; no hook build, redeployment or state migration was required.

## Verified snapshot

Testnet ledger **13470049**, hash `465CBC1FFF29FECA603ABD8CACFFEE94F9891F3102E34F7B68CE0DD3EA7CC98E`. Network, installed chain order/hashes, all effective namespaces and the account's single namespace inventory were verified before collecting pinned public HookState.

| Check | Result |
| --- | --- |
| Real HookState entries | 84; each matches exactly one projection |
| Source-layout fixtures | 9; explicitly synthetic, not ledger entries |
| Total projections | 93 across ten manifests, covering 18 record families |
| Unmatched / multiple matches / unexercised projections | 0 / 0 / 0 |
| Upstream CLI | Whole-account check and all 20 ABI/manifest validations pass |
| Validator warnings | 0 |
| Focused SDK/ABI regressions | 98 pass |
| Follow-up ABI/indexer regressions | 39 pass, including the same seven ABI tests |
| SDK key/encoding checks and repository/schema checks | Pass |

The first strict check found three unknown one-byte-zero keys. The tool did not assume they were TLD flags. Each HookState's `PreviousTxnID` led to a validated `removeTld` receipt proving the preimages `zzq`, `s7yx42`, `s7yvd4`. The [testnet catalog](../../explorer/catalog.testnet.json) records those public transaction hashes. Their disabled tombstones were preserved.

Output/evidence: ignored `hook/build/current/explorer-testnet/`, including `snapshot.json`, `verification.json`, `check.json`, `coverage.log`, validator logs and manual publication instructions. Upstream tooling stays outside the publishable SDK/indexer packages.

## Scope and publication

Selectors use exact known keys because the explorer cannot reverse a domain hash or join its record inventory. This is verified **snapshot coverage**, not a promise to decode future domains, keys, address lengths or descriptor upgrades. Each record kind has one logical ABI owner even when several hooks write it. Unknown keys and additional uninventoried namespaces stop generation; there is no length-only fallback. Projection-count/manifest-size limits are enforced.

Root mint time is eight-byte `UInt64 BE` with Ripple epoch semantics; pending/pricing drops are integer `UInt64 BE`; flags remain integers. Addresses are raw bytes, not automatically treated as XRPL account IDs. Legacy unnamed custom descriptors expose their stored state key without inventing a name.

No explorer authentication or publication was performed. Review the generated files and use the network's Namespace editor to publish from the maintainer's own Google/Xaman account. A new HookHash or changed snapshot/catalog needs revalidation. This tooling neither proves domain ownership nor replaces SDK/indexer reads, native weak-phase fault tests or application metadata services. No wallet signing, transaction submission, frontend production build or screenshots occurred.
