# XahauName hooks

The on-chain component of XahauName. Native Xahau Hooks implement domain registration, URIToken ownership, address/text records, primary selections and lifecycle cleanup in a shared namespace.

The implementation is a chain of ten C handlers. Each handler has a WASM module and transaction mask; [handlers.json](config/handlers.json) defines their order. The [protocol](../docs/SPEC.md) defines wire/state formats, and the [function reference](../docs/HOOK-FUNCTIONS.md) describes C entry points and helpers.

## Handler responsibilities

| Handler | Responsibilities | Source |
| --- | --- | --- |
| issuance | Registration checks, identity reservation, mint/offer/refund emissions and callbacks | [issuance.c](src/handlers/issuance.c) |
| set-address | Set/clear receiving addresses and update their index | [set-address.c](src/handlers/set-address.c) |
| authorization | Verify root ownership and native token custody for mutations | [authorization.c](src/handlers/authorization.c) |
| set-text | Standard, service and custom text values | [set-text.c](src/handlers/set-text.c) |
| clear-text | Remove text values, descriptors and custom-key slots | [clear-text.c](src/handlers/clear-text.c) |
| control | Primary selection and record reset | [control.c](src/handlers/control.c) |
| admin | Pricing, TLDs, registration pause and metadata URIBase | [admin.c](src/handlers/admin.c) |
| claim | Claim/transfer finalization, reconciliation and Remit policy | [claim.c](src/handlers/claim.c) |
| burn | Native burn cleanup | [burn.c](src/handlers/burn.c) |
| profile | Atomic Global Keys updates | [profile.c](src/handlers/profile.c) |

[common.h](src/common.h) contains state keys, parsers, indices, serialization, slot access and journaled lifecycle helpers. Claim and burn share lifecycle dispatch; transaction masks select their entry paths.

## Registration lifecycle

Registration reserves the name/token mapping, emits a native mint and creates a restricted zero-price sell offer. The recipient claims with URITokenBuy; only then does the root grant domain ownership. Accepted transfers clear prior records and primary selection. Burn removes the domain's indexed state.

The [architecture walkthrough](../docs/ARCHITECTURE.md#registration-and-claim) follows these stages through SDK calls, C handlers and receipt processing. The [state reference](../docs/SPEC.md#5-state) defines persisted bytes.

## Build

Use Node.js 20+, Docker and a C++17 compiler. Windows uses WSL Ubuntu for the native checker. Run from the repository root:

```sh
docker build -t xahauname-hook-toolchain:cli-3.0.0 hook/toolchain
node scripts/setup-guard.mjs
npm run hook:build
```

The toolchain pins compiler dependencies and native checker sources. Modules must satisfy native size, instruction and block-nesting limits. Rebuild one handler with:

```sh
node scripts/build-hooks.mjs --part profile
```

Changing common.h requires rebuilding the full chain. Generated WASM/hex, logs, guard results and checksums live under ignored `hook/build/current/<handler>/`.

## Verification and deployment

```sh
npm run hook:test
npm run hook:check-deploy
```

The [production-WASM harness](test/) exercises cleaned modules. [Build scripts](../scripts/build-hooks.mjs) and [test orchestration](../scripts/test-hooks.mjs) bind results to exact artifact hashes. Native ledger validation follows the [deployment guide](DEPLOY-TESTNET.md); installed identities are in [deployment manifests](../deployments/).

`DOCKER_BIN` and `GUARD_CHECKER` select local executables. The [toolchain](toolchain/) contains pinned versions, compiler configuration and guard-source checksums. Source checksums cover the exact checkout; rebuild verification artifacts for the checkout being deployed.
