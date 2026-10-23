# Lifecycle recovery and client review fixes

Date: 2026-10-23. The reviewed candidate is now deployed on testnet; SDK package changes are not published.

## Finding status

| Finding | Change | Status |
| --- | --- | --- |
| OCR-01 / F-01 | Durable journal, explicit strong Invoke17, ledger-derived owner/existence, resumable cleanup, SDK recovery, indexer quarantine/recovery verification | Implemented; production-WASM model coverage. Native-ledger fault injection remains a release gate. |
| OCR-02 | Reject root plus pending/refund/mint/offer tracking; validate restricted free claim offer; discover journal-only partial burns | Fixed with bootstrap/replay regressions. |
| OCR-03 | Prepare missing Fee before requesting a signature; fail closed without Fee/autofill; enforce ceiling; compare immutable receipt intent | Fixed with pre-sign and receipt-substitution regressions. |
| OCR-04 | Network-neutral funding/connection instructions | Fixed with diagnostic regressions. |

## Recovery design

Weak execution cannot undo native buy/burn. The pinned xahaud implementation passes a shared HookStateMap to hook execution and finalizes weak state after running weak handlers; code must not assume a weak rollback restores all earlier writes. Source inspected: [Transactor.cpp](https://github.com/Xahau/xahaud/blob/5c05e107c0211dcedb7adcf73dab1f6012747fe7/src/xrpld/app/tx/detail/Transactor.cpp), [HookResult state reference](https://github.com/Xahau/xahaud/blob/5c05e107c0211dcedb7adcf73dab1f6012747fe7/src/xrpld/app/hook/applyHook.h), and [applyHook.cpp](https://github.com/Xahau/xahaud/blob/5c05e107c0211dcedb7adcf73dab1f6012747fe7/src/xrpld/app/hook/detail/applyHook.cpp). This is source-based reasoning, not a native fault-injection run. The [fixXahauV1 amendment](https://xahau.network/docs/features/amendments/) made the URIToken issuer weak on burn; the older strong/weak table must not override this amendment.

The journal binds full token ID, original root and canonical name. It is written before cleanup and deleted last. Preflight verifies custom slots before a journal can authorize resuming missing slots. Owner mutation and registration refuse an unfinished journal. Primary cleanup uses the original owner even if root was already changed. Interrupted initial claims can finish after pending/stage deletes because the journal retains claim provenance. Original refund obligations are never silently cleared.

`registrar.reconcile(domain)` submits one strong Invoke. Its caller cannot select an owner: the hook reads native Owner/Issuer or confirmed token absence with the slot API. Identity mismatch and slot/read errors reject. A strong failure rolls the repair transaction back; the journal remains available for retry. Do not repeat a native purchase/claim/burn to repair domain state.

The indexer retains quarantine across replay/restart. It clears quarantine only with a validated known-handler reconciliation acknowledgement, matching target identity, and committed state proving final identity plus record/primary cleanup. A return string or root-owner change alone is insufficient.

## Validation boundary

Production-WASM probes deliberately retain partial weak writes and inject one failure at every lifecycle write/delete boundary. Follow-up Invoke runs the full strong hook chain; its sandbox is modeled explicitly. Cases cover replay, substituted identity/issuer, treasury token before claim, unsettled refund obligation, failed repair retry, missing custom slots, and maximum-length/maximum-record cleanup. These tests do not establish native HookState persistence or consensus behavior.

Before production, run controlled native fault injection on an isolated ledger/account: initial claim, transfer, burn; failure before journal, custom value/slot/index deletion, primary/root/mapping update and final journal deletion; inspect tesSUCCESS/native Owner/deletion, committed HookState, recovery receipt and repeated recovery. Verify reserve/collect-fee exhaustion and strong recovery rejection as well. No standalone xahaud runtime was present in the local Docker inventory. The follow-up deployed the production candidate on public testnet and exercised normal lifecycle/reconciliation, without deploying fault-injected variants.

Pre-journal corruption that has already lost identity/index/custom-key evidence cannot be reconstructed automatically. Failed mint/refund and administrative issuance settlement remain operator cases. A journal-free consistent owner is not permissionlessly reset. The extension does not claim atomicity between native token mutation and weak finalization.

## Release handling

The user subsequently authorized testnet redeployment. SetHook F6C1A8F4EE7AD80E829A5C823B716F0F177E5F65DA30256FD7AEB69EB13593B1 validated tesSUCCESS with all ten handlers, including Invoke99 in the claim mask. The manifest and SDK preset now match the installed hashes. Pricing, URIBase and all62 namespace entries were preserved. No frontend production bundle, mainnet transaction, npm publication or Git history rewrite was performed. Package version0.3.0 remains unchanged; npm changes are unpublished.

## Final verification

| Check | Result |
| --- | --- |
| All ten production WASM builds and unchanged native guard checker | PASS; every module below65,536 bytes; maximum12,976 bytes |
| Production WASM probes | 272/272: lifecycle157, profile30, policy12, validation73 |
| Deployment masks | 1,280/1,280 |
| SDK | 78/78 after the live-routing regression fix |
| Indexer including bootstrap/replay and quarantine completion | 38/38 |
| Application including wallet-filled fee/mutation and network-neutral diagnostics | 143/143 |
| Workspace tooling | 3/3 |
| SDK/indexer pack checks | PASS |
| App TypeScript, repository local links/private-material scan | PASS |
| Exact current source hashes and tested artifact hashes | PASS for all ten modules |

| Module | Bytes | Guard worst-case instructions |
| --- | ---: | ---: |
| issuance | 12512 | 32183 / callback63466 |
| set-address | 3831 | 36077 |
| authorization | 3524 | 23171 |
| set-text | 5619 | 56021 |
| clear-text | 4740 | 35701 |
| control | 5937 | 52562 |
| admin | 3186 | 37718 |
| claim | 12965 | 56716 |
| burn | 12976 | 56722 |
| profile | 4535 | 32820 |

Combined code size is69,825 bytes across ten modules; the64KB native limit is checked per module. The checker also enforces the unchanged32-block nesting and65,535-instruction limits. Fixed-length journal copies are compiled into straight-line instructions; guards were not weakened or raised. Shared lifecycle dispatch avoids optimizer specialization that over-expanded loops in a burn-only implementation.

Ignored local evidence: `hook/build/current/verification.json`, per-module `proof.json`/`guard-check.log`, `build-final-fixes.log`, `hooks-final-fixes.log`, `sdk-fixes.log`, `indexer-fixes.log`, `app-fixes.log`, `typecheck-fixes.log`, `package-fixes.log` and `repo-fixes.log`. Source/artifact proofs were rechecked against the final working tree. The tests intentionally separate weak partial writes from strong-chain sandbox rollback.

## Testnet deployment follow-up

See [deployment verification](TESTNET-RECOVERY-DEPLOYMENT.md) and [public receipts/trace](../../deployments/testnet-recovery-validation.json). Live validation completed54 checks and37 validated tesSUCCESS transactions using two fresh wallets, with both temporary domains burned afterward. One of those37 transactions was an initial SDK Invoke without Destination: it did not execute the hook and failed SDK acknowledgement. The suite stopped; the SDK routing bug was corrected and covered by ordinary-wallet/treasury tests. A narrowly scoped resume re-queried the validated no-effect receipt, retained its failure record, and continued without repeating purchase or claim. Corrected reconciliation, transfer cleanup, burn, repeated post-burn reconciliation and smoke then passed. Controlled native failure recovery remains unproven.
