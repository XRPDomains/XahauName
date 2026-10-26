# P2 isolated native verification

Date: 2026-10-26. [Machine-readable evidence](../../deployments/standalone-p2-validation.json). Localhost standalone, NetworkID **65535**. Production C, production artifacts and deployment presets are unchanged.

## Results

The final run passed **52 named checks**, with **268 signed transactions**: 267 validated `tesSUCCESS` and one deliberately rejected strong reconciliation (`tecHOOK_REJECTED`). Emitted children are separate from that signed-transaction count.

| Case | Native result and postcondition |
| --- | --- |
| Exact production bytes, ten handlers | Install, buy, mint/offer callbacks, claim, custom text/address, transfer cleanup, burn and repeated reconciliation passed |
| First claim: writes 1–9 | Native custody moves; weak failure is quarantined; repair restores owner and clears pending/correlation/journal |
| Transfer: writes 1–11 | Native custody moves; partial primary/address/custom-slot/index/root/reverse-map cleanup is quarantined and recoverable |
| Burn: writes 1–11 | Native token disappears; partial namespace state is quarantined and fully removed by repair |
| Failed strong repair | `tecHOOK_REJECTED`; namespace byte-identical to pre-repair snapshot; subsequent and repeated repairs succeed |
| Emitted mint: `tecDUPLICATE` | Production callback emits one successful refund; buyer loses only the originating fee; pending/refund correlation clears |
| Refund: `tecDST_TAG_NEEDED` | Pending and correlation remain; clearing the recipient flag does not replay payment; operator recovery remains required |
| Indexer replays actual transfer/burn failures | Domain leaves normal owner lists; failed strong repair retains quarantine; successful repair clears it; repeated repair is idempotent |

There are **31 injected write-error cases**. Namespace snapshots show zero retained changes at write 1 and retained earlier writes at later failures (up to ten changed keys in the burn fixture). This verifies native weak-phase partial persistence for these paths. Indexer replay spans local ledgers 690–694 for transfer and 882–885 for burn.

## Injection method and scope

The first install uses exactly the production byte hashes in `deployments/testnet.json`. The fault phase replaces only claim/burn with separately built **test-only** artifacts. An inline wrapper reads the `fi` HookParameter; on the selected `state_set` call it supplies a zero-length key to the actual native API. The original handler receives the native error and follows its existing rollback/recovery code. This tests native API-error paths through instrumented copies, not arbitrary engine, memory-corruption or process-crash faults.

Both test artifacts passed the unchanged guard checker: claim **14,112 bytes**, burn **14,534 bytes**. Hashes are in the evidence. Sources, binaries, complete receipts and namespace snapshots remain under ignored `hook/build/current/`; test-only artifacts must never be deployed publicly.

The node is `2026.10.16-dev+4158`, commit `3dc41b2a5951855f7c5c88c9efed0299e7a843ec`. Binary SHA-256: `519c8dfc59bbde10d4be54907945fbf2b71ff3b58cb5ed4bab34d8d43b68ae7d`. Its MD5 matches the publisher releaseinfo. Binary source: [official build host](https://build.xahau.tech/); setup reference: [node installation](https://xahau.org/docs/infrastructure/installing-xahaud/).

Configuration upvotes 88 entries from the observed testnet set supported by this binary. HookOnV2, AMMClawback and fixXahauTestnetGenesis are absent from its supported list; dev defaults can enable other entries. This is not exact public-testnet amendment parity. Initial preflights corrected fresh-node amendment configuration and the harness's genesis-key algorithm; these were setup errors, not product defects.

Still open: expiry and stale/out-of-order callbacks, failed offer emission, failed-refund retry/settlement design, maximum native record inventory, process/consensus crash and corrupted state. The intentionally failed-refund fixture stays pending in this disposable chain. F-01 has **partial native verification**, not unconditional mainnet approval.

## Reproduce

Use a disposable node with no peers, the pinned binary above and [standalone configuration](../../hook/test/standalone/xahaud.cfg). Ports bind localhost only. Start with a fresh `/tmp/xahauname-standalone/db` directory and `xahaud --standalone --start --conf <absolute-config-path>`; Windows runs the Linux binary in WSL. Existing wallet databases can override amendment votes; preserve them and choose a new disposable database path instead of resetting a shared node.

From the repository root, with SDK/indexer packages built and production artifact/proof files available:

```powershell
$env:XAHAUNAME_STANDALONE='1'
node hook/test/prepare-native-faults.mjs
$env:STANDALONE_RUN='native-faults-new-run'
$env:STANDALONE_FAULTS='1'
$env:STANDALONE_EMITS='1'
node hook/test/standalone.cjs
$env:STANDALONE_RECOVERY_RUN=$env:STANDALONE_RUN
node packages/indexer/test/standalone-recovery.cjs
```

The builder needs the existing Docker compiler image and guard checker (`GUARD_CHECKER` can select its path), and refuses existing fault artifacts. The runner refuses existing journals, hardcodes localhost/65535, checks required amendments and production proofs, and creates disposable wallets in memory without reading private environment files. The indexer runner is read-only. All are excluded from default offline tests. Omit `STANDALONE_FAULTS`/`STANDALONE_EMITS` for production-only normal lifecycle. Preserve receipts and stop the disposable node afterward.
