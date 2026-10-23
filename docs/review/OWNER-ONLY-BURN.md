# Owner-only burn authorization

Verified on 24 October 2026 (Asia/Ho_Chi_Minh), network 21338. Public evidence: [deployment](../../deployments/testnet.json), [live verification](../../deployments/testnet-owner-burn-validation.json).

## Finding and change

Minted tokens have `tfBurnable=1`. Native Xahau therefore permits issuer burning after ownership has transferred. The former burn entry scheduled weak cleanup without checking native custody. The SDK already checked ownership, but direct ledger transactions bypassed that client check.

[burn.c](../../hook/src/handlers/burn.c) now authorizes strong burns before native application: read the exact token keylet, read its native Owner and compare it to transaction Account. Mismatch rolls back with code12 and `only token owner may burn`; unavailable native ownership rejects20; missing transaction fields reject3. Hook root data is not an authorization substitute. A treasury-owned unclaimed token remains burnable by the treasury for recovery. Owner burns received weakly still finalize after the native object has been deleted.

The burnable flag is deliberately retained. Removing it would make the issuer a weak stakeholder for Buy/Remit, so the current Remit prohibition could no longer prevent bypassing record cleanup. This fix enforces owner-only burning through the installed hook chain, including existing tokens; it does **not** revoke the native flag or prevent the treasury from changing/removing the chain through an upgrade. Immutable native owner-only burning needs a separate lifecycle design and a policy for existing immutable tokens.

Protocol references: [URIToken flags](https://xahau.network/docs/protocol-reference/transactions/transaction-types/uritokenmint/), [weak/strong execution and URIToken stakeholder table](https://xahau.network/docs/hooks/concepts/weak-and-strong/), [native stakeholder implementation](https://github.com/Xahau/xahaud/blob/dev/src/xrpld/app/hook/detail/applyHook.cpp).

## Verification

- All 10 production WASM artifacts passed the unchanged native static guard checker. Burn: 13,382 bytes; maximum estimated execution count60,912. No guard limits were raised.
- All283 hook probes passed: lifecycle168, profile batch30, policy12 and validation73. The11 new burn cases cover issuer/third-party denial, stale/missing roots, native-owner authorization during reconciliation, treasury custody, unavailable native slots, malformed transaction fields and weak cleanup after deletion. Eight of these cases failed against the old production artifact.
- All95 SDK tests and1,280 deployment mask checks passed. SDK deployment hashes were regenerated after validated installation. No frontend production build was needed.

## Native testnet evidence

Only the fresh domain `ownerburn2775916699.xah` and two disposable wallets were used. Before deployment, an issuer-burn simulation returned `tesSUCCESS` with a deleted URIToken node; that simulation changed no ledger state.

| Check | Result | Transaction |
| --- | --- | --- |
| Upgrade | Validated `tesSUCCESS`, namespace preserved | [7A89D09D…](https://test.xahauexplorer.com/explorer/7A89D09D0495D7AEDC8E924C837A027762A38D8DD8EA26618321307A10B4450B) |
| Issuer burns another wallet's token | Validated `tecHOOK_REJECTED`, return code12, no hook state changes | [F6B92E29…](https://test.xahauexplorer.com/explorer/F6B92E293AC0E7AD4669948D523C0D1799683890DBF288EBEB912C7BD0FA689B) |
| Transfer to second wallet | `tesSUCCESS`; profile/custom text and old primary cleared | [849CD442…](https://test.xahauexplorer.com/explorer/849CD442AE86F4909AB23E821A5E99A6A7C9FFFB2EAD56AB7D35A830F208936A) |
| Issuer after transfer | Simulation rejected12 | See public verification JSON |
| Previous owner burn | Simulation `tecNO_PERMISSION` | See public verification JSON |
| Remit bypass | Simulation rejected65 | See public verification JSON |
| Current owner burn | `tesSUCCESS`, return code0, `burned`; identity/custom records deleted | [2D366746…](https://test.xahauexplorer.com/explorer/2D366746B361B72924D75D56A504F9438283D4B60DFC6B235A29B3156A2DED4B) |

Final namespace matched the initial78 entries exactly. Existing domains were not burned or migrated. The public evidence contains no seeds.

## Reproducing the native regression

[owner-burn-live.cjs](../../hook/test/owner-burn-live.cjs) is an explicit two-phase test, excluded from offline tests. Set `OWNER_BURN_TESTNET=1` and a unique `OWNER_BURN_RUN`, then run `node hook/test/owner-burn-live.cjs before` against the vulnerable deployment. Build/check/deploy the fixed chain before running the same command with `after`. The first phase simulates the defect; the second submits a deliberately rejected issuer burn and a successful current-owner burn. It also exercises SDK profile, primary and transfer cleanup. Secrets use ignored local environment files; submission hashes are journaled before sending. If a phase fails, inspect receipts before any further submission; do not rerun a phase blindly.
