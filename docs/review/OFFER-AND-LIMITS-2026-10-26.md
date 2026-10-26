# Native offer failure and maximum record limits

Date: 2026-10-26. Baseline `5526273`. [Evidence](../../deployments/standalone-offer-and-limits-validation.json). Both runs use an isolated localhost node, NetworkID 65535, `2026.10.16-dev+4158` / commit `3dc41b2a5951855f7c5c88c9efed0299e7a843ec`. Production C and artifacts are unchanged; there was no public redeployment.

## Rejected emitted offer

**22 checks PASS; 23 signed transactions.** These include the existing normal lifecycle baseline, not 22 new unique scenarios. A [130-byte test recipient hook](../../hook/test/fixtures/reject-offer.c), activated only for URITokenCreateSellOffer, rejects with code777. Its unchanged guard check passes at nine instructions. The treasury uses all ten exact production artifacts.

Mint validates successfully. The recipient's strong hook rejects the emitted offer with `tecHOOK_REJECTED`; the production callback queues one successful refund. Buyer balances differ only by the originating payment fee. Pending and async correlations clear, but the minted native token remains treasury-owned without a sell offer, and its domain mapping stays reserved.

The SDK reports `recoveryRequired`. A simulated repurchase rejects31; claim is blocked before signing. Treasury, as the actual native owner of this **unclaimed** token, can burn it after refund settlement. All identity state then clears. Removing the recipient test hook allows the same name to be purchased/claimed again without inherited records, followed by successful burn. This does not grant an issuer permission to burn a token owned by a user.

The indexer bootstraps at ledger27 and replays every ledger28–49. The failed offer never enters the recipient inbox or creates an ownership event. After refund, the reserved token is recoveryRequired and absent from ordinary owner lists. Burn removes it; only the later successful claim produces claimed ownership. Final cleanup removes the profile.

## Maximum inventory

**24 checks PASS; 166 signed transactions**, including eight intentional validated `tecHOOK_REJECTED` overflow attempts. This run also includes the normal baseline.

Each of four cases uses a 57-byte label and 8-byte enabled TLD, **15 address records of 128 bytes**, and **15 custom text records with 40-byte keys and 128-byte values**. Fifteen custom records fill the total text index; standard keys share that same limit. Addresses are opaque byte vectors for serialization limits, not valid network address codec examples.

| Case | Artifact and verified result |
| --- | --- |
| Transfer | Production: owner changes and all address/custom/index state clears |
| Burn | Production: native token and all domain/record state disappear |
| Interrupted transfer | Prior guarded test-only claim copy fails native state_set20; journal/quarantine survive; two strong reconciliations restore correct ownership and empty records |
| Interrupted burn | Prior guarded test-only burn copy fails native state_set20; repair removes partial state and is idempotent |

In every case a 16th address and 16th text are submitted as real strong Invokes, reject62, and leave namespace contents byte-identical. After final cleanup each case restores the exact three-entry admin baseline. The 66-byte name exercises a 133-byte recovery journal under ExtendedHookState.

Independent native indexer replay verifies the full 15-address/15-custom profile before each interrupted operation, quarantine after weak failure, then complete repair and repeat-repair behavior. The transfer interval is ledgers206–209; burn is252–255. These are bounded native RPC observations, not an independent consensus proof.

## Reproduce and limits

Use the [disposable node setup](P2-STANDALONE-2026-10-26.md#reproduce). With compiled SDK/indexer packages, production artifacts and the earlier claim/burn fault artifacts available:

```powershell
$env:XAHAUNAME_STANDALONE='1'
node hook/test/prepare-native-faults.mjs --reject-offer
$env:STANDALONE_RUN='native-offer-new-run'
$env:STANDALONE_OFFER_FAILURE='1'
node hook/test/standalone.cjs
$env:STANDALONE_RECOVERY_RUN=$env:STANDALONE_RUN
node packages/indexer/test/standalone-recovery.cjs
Remove-Item Env:STANDALONE_OFFER_FAILURE
$env:STANDALONE_RUN='native-maximum-new-run'
$env:STANDALONE_MAX_INVENTORY='1'
node hook/test/standalone.cjs
$env:STANDALONE_RECOVERY_RUN=$env:STANDALONE_RUN
node packages/indexer/test/standalone-recovery.cjs
```

Unset unrelated scenario flags before running. The builder refuses existing fixture output; reuse a verified fixture or preserve earlier output before rebuilding. No guards/checker limits were raised. Raw receipts and namespace snapshots remain under ignored `hook/build/current/`; the small recipient fixture is never installed on a public network. No frontend build, screenshot test or package publication occurred.

Selected failed-offer and maximum-inventory native gates now have evidence. Expiry/stale callback behavior, refund retry/settlement and migration, arbitrary engine/process crashes, broader concurrency and production-scale indexing remain open. See [findings](FINDINGS.md) and the [refund design](REFUND-RECOVERY-DESIGN.md).
