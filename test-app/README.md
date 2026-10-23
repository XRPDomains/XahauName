# XahauName testnet domain manager

English UI using the SDK workspace and XRPL Wallet Kit 0.2.1. The default deployment is Xahau Testnet. Network, endpoint and reviewed deployment come from the [shared network configuration](../docs/NETWORKS.md). The app has no private-key fields or server signing endpoint.

## Development

```sh
npm ci
npm run app:dev
```

Open http://127.0.0.1:5173/. Vite and TypeScript resolve local SDK source, so SDK changes use HMR. Do not build a server package for ordinary edits. [Static deployment](DEPLOY.md) is a separate explicit action.

Run commands from the repository root. The root lockfile installs the SDK, indexer and private app together; the app has no separate lockfile.

## Wallets

Kit uses default light accent, autoReconnect and localStorage session persistence. Validated total XAH balance comes from SDK WebSocket transport; it is not a spendable-balance estimate. Balance refreshes after writes and periodically while visible. Provider/session expiry may still need manual approval.

GemWallet, Xyra and Xaman are enabled. Select Xahau Testnet in the wallet, permit Xyra popups and configure Xaman origin/redirects. Public Xaman client ID:1c7dfba7-aadd-4b03-bafb-ca5c8f84bb4f; VITE_XAMAN_CLIENT_ID can override it. Never put a seed in the app. Fund test wallets through https://xahau-test.net/.

## Flows

- Search normalizes friendly input and appends .xah. Purchase waits for mint/offer and then requests the separate claim signature. A declined claim remains available later; the app does not repay automatically.
- My domains lists owned names and incoming registration/transfer offers with Claim. Transfer/Burn open dialogs directly from cards. Burn needs exact-name confirmation.
- Profile reads addresses, standard/custom texts and legacy unnamed values. Transfer/burn/reset clear all indexed data and old primary. Owner lock is retired.
- Receiving presets are separate XAH (21337) and XRP (144), plus BTC, ETH, SOL (501) and TRX. Unsupported legacy bytes remain visible as advanced hex.
- Ten Global Keys share one Save profile action and atomic Invoke. Services/custom keys use generic text APIs. Website content is available through SDK content helpers and the custom contenthash record.
- Profile avatar uses the avatar text first, optionally falling back to token metadata artwork. Cards use metadata images. Images are display-only and square. Metadata CORS/availability can require a same-origin API or gateway.
- Treasury configuration supports register-for-recipient and URIBase, without embedding treasury credentials.
- Submitted hashes, validated results and hook traces remain visible. Uncertain results require ledger lookup rather than automatic retry.

## Verification

```sh
npm run app:test
npm run app:typecheck
npm --prefix test-app run test:browser
```

Browser smoke expects local Vite and installed Chrome. APP_TEST_URL selects another running instance. Read-only ledger/metadata checks and layout fixtures do not sign transactions. Real extension approvals require manual testing on the intended HTTPS origin.

See [SDK API](../docs/API.md) and [wallet integration](../docs/WALLET-INTEGRATION.md). No frontend production artifact is kept in source control.

The source-development TypeScript configuration disables package export-map type resolution to read multiformats9 declarations through its typesVersions mapping. Runtime imports still use normal package exports; no aliases point at declaration-only files. npm11 may report the upstream xumm npm<=10 engine warning; Node22 with npm10 avoids that warning.
