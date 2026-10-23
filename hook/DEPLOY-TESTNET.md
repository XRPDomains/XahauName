# Testnet deployment

This workflow targets only wss://xahau-test.net, NetworkID 21338. Use disposable testnet credentials.

1. Build and verify the complete chain using [hook development](README.md).
2. Create ignored hook/deploy/.env.local from .env.example. Fund the disposable treasury and enable its collect flag for the burn hook.
3. Inspect deployments/testnet.json: the expected installed baseline. New-chain bootstrap needs a separate reviewed initialization plan; this upgrade script refuses unknown accounts/baselines.
4. Simulate: `node hook/deploy/testnet.cjs --check`.
5. For an authorized upgrade, set XAHAU_DEPLOY_TESTNET=1 and run `node hook/deploy/testnet.cjs`. PowerShell: `$env:XAHAU_DEPLOY_TESTNET='1'`.

The script verifies network/account/baseline, source/artifact hashes, native-checker logs and tested WASM hashes. It audits custom display/mail/phone collisions, snapshots state, caps SetHook fee at 40 XAH, simulates, journals the transaction hash before submission, confirms validated success and checks unchanged namespace. Only then does it update public deployment identity and SDK configuration. Effective installed HookOn/HookCanEmit overrides are verified.

Evidence is in ignored hook/build/current/deployment/. An existing signed journal prevents rerun: inspect its recorded hash/receipt first. A reviewed new attempt can use XAHAU_DEPLOY_RUN=<directory-name>; do not erase journals. Unknown outcomes must be queried before resubmission.

## Bootstrap

Upgrades preserve pricing/TLDs/URIBase; do not reinitialize them unnecessarily. A new deployment must set pricing and URIBase using the treasury SDK signer before purchases. Current testnet drops for lengths 1..9,10+:

```text
5000000000, 2000000000, 500000000, 100000000, 50000000,
30000000, 20000000, 15000000, 12000000, 10000000
```

URIBase: https://xrpdomains.xyz/api/nftdomains/metadata/. Public identity is in [the manifest](../deployments/testnet.json).

## Live validation

Rebuild SDK, then `SDK_LIVE_TESTNET=1 node sdk/test/live.cjs`. It creates two fresh wallets, stores seeds in ignored local environment files, funds them and tests purchase/claim, Globals, receiving addresses, primary, website content, transfer, reset, burn and smoke through SDK. Unexpected failure stops the suite and retains receipts.

The narrowly scoped --resume-failed-purchase accepts only a known validated initial tecHOOK_REJECTED after two successful funding transactions. It retains that failure and reuses the funded wallets. No general silent restart is supported.

Smoke requires a bare Payment with validated tesSUCCESS and HookReturnCode0. Separately verify dependent callbacks, native ownership, complete cleanup and incoming-offer discovery. Install success cannot establish these.

SDK_LIVE_RUN selects a new local journal directory (letters, digits and hyphens only). Keep previous runs and their failed receipts. Changed-slot upgrades retain byte-identical slots rather than uploading their code again.

Read-only post-release verification: `node sdk/test/verify-release.cjs`. VERIFY_BASELINE may point to a local before-state.json snapshot to require exact namespace cleanup as well as the public deployment checks. No seed is used by this script.
