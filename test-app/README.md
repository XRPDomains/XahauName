# XahauName domain manager

A wallet-connected interface for discovering, owning and managing XahauName domains. The application uses [@xahauname/sdk](../packages/sdk/README.md) for domain operations and XRPL Wallet Kit for wallet sessions and signing.

## Features

- Search for a name, view its price and complete purchase and claim.
- Browse owned domains and incoming registration or transfer offers.
- Edit a profile's Global Keys with one atomic Save profile transaction.
- Manage XAH, XRP, BTC, ETH, SOL and TRX receiving addresses, service links and custom text records.
- Set a verified primary name and IPFS website content.
- Transfer or burn a domain from its card, with dedicated confirmation dialogs.
- Display avatars and square artwork from token metadata, with transaction details in Activity.

## Run locally

Use Node.js 20+ and run from the repository root:

```sh
npm ci
npm run app:dev
```

Open http://127.0.0.1:5173/. Vite imports the local SDK source, so application and SDK edits update during development. The [static hosting guide](DEPLOY.md) covers production builds and server configuration.

Developer Docs are available at `/docs/` from the app menu. Concise English pages live in [docs/site/](../docs/site/overview.md); [the Docs generator](docs/site.ts) prerenders them into static HTML, with local search and copyable examples. Docs do not load Wallet Kit or contact the ledger. A requested application build includes `dist/docs/`, ready to upload alongside the app without a separate server.

The initial screen is Find a name. Connecting or restoring a wallet opens My names and refreshes its collection, while an active discovery draft, quote, checkout or public profile stays open. Disconnecting from My names returns to discovery.

Hash routes preserve browser Back/Forward and work under a static hosting subdirectory: `#/find`, `#/find/lookup`, `#/my-names`, and `#/name/alice.xah/records` (also `addresses`, `profile`, `settings`). Changing profile sections reuses the displayed snapshot; entering a profile performs a fresh verified read. Navigation waits for an in-flight action to settle and never replays a signature.

Activity opens from the footer in a separate dialog. It contains this session's actions, transaction hashes, status lookups and collapsed technical details for troubleshooting; it is not a complete wallet history. Opening Activity alone does not request ledger data.

The application connects to the ledger on demand: a submitted search, profile lookup, transaction-status check, or connected-wallet balance/domain view triggers the connection. Opening the landing page or an empty form does not make ledger requests. Read failures appear beside the relevant form; Activity retains technical details.

## Network and wallets

[Configuration](src/config.ts) selects a shared network profile and deployment. See [network configuration](../docs/NETWORKS.md) for environment variables, endpoints and deployment manifests.

GemWallet, Xyra and Xaman are configured through Wallet Kit. Sessions use auto-reconnect and persistence; the wallet control displays the validated total XAH balance. The selected wallet network must match the application configuration. Signing happens in the connected wallet; the application has no private-key input.

The [wallet integration guide](../docs/WALLET-INTEGRATION.md) describes the signer contract, public Xaman configuration and signing/confirmation flow.

## Source guide

| File | Responsibility |
| --- | --- |
| [src/main.ts](src/main.ts) | Application entry point |
| [src/app.ts](src/app.ts) | Wallet lifecycle, navigation, dialogs and SDK actions |
| [src/views.ts](src/views.ts) | Domain cards, incoming offers and profile/address markup |
| [src/config.ts](src/config.ts) | Network and deployment settings |
| [src/wallet-signer.ts](src/wallet-signer.ts) | SDK signer integration for Wallet Kit |
| [src/wallet-balance.ts](src/wallet-balance.ts) | Balance transport and refresh handling |
| [src/purchase.ts](src/purchase.ts) | Purchase-to-claim interaction |
| [src/records.ts](src/records.ts) | Receiving-network presets and profile fields |
| [src/domain-input.ts](src/domain-input.ts) | Friendly domain input normalization |
| [src/metadata.ts](src/metadata.ts) | Metadata fetching and local proxy integration |
| [src/styles.css](src/styles.css) | Layout, spacing, states and responsive styling |

A purchase and its claim are separate wallet approvals. Declining claim leaves the domain available to claim later. Profile saves use one Invoke; accepted transfers clear existing records and primary selection according to the [protocol lifecycle](../docs/SPEC.md#4-transfer-burn-and-reset).

Find a name pairs registration and public profile lookup in a full-width, two-column desktop surface, stacking the panels on small screens. Navigation handlers bind only to navigation buttons so form clicks retain input focus. Registration uses a label input with a visible `.xah` suffix and an inline Payment → Mint & offer → Accept offer progress view. Wallet connection preserves the quote. An explicit Buy click may open the wallet picker and continue to payment after connection, session validation and a fresh price check. Closing the picker or leaving the page while connecting cancels that intent; an ordinary connection does not start a payment. Public domain/account/hash hints survive reload and are scoped by network, treasury and namespace. They block uncertain repeat attempts but never establish ownership; continuation reads validated ledger state again. Unknown payment/claim outcomes remain blocked, while a validated failed receipt can release that attempt for an explicit user retry.

My names reloads on each entry and after a completed registration claim. The collection keeps primary first, then sorts by registration time or a locally observed acquisition. New badges cover the past seven days; acquisition hints are wallet/deployment-scoped and never establish ownership. Keyword, exact length (1–10 or >10), character and ordering controls work locally without extra RPC reads. Ready to claim appears above the owned collection. Unknown claim feedback links directly to `#/my-names/claims`; a verified inbox claim clears that name's saved purchase hint. Emoji names are unsupported by the current protocol.

## Development checks

```sh
npm run app:test
npm run app:typecheck
```

These checks do not start a browser or capture screenshots. During development, run only tests relevant to a behavior change; cosmetic edits do not require the full suites or a production build.

Browser/layout checks run only when explicitly requested. With a running Vite instance and installed Chrome, use `npm run test:browser --workspace xahauname-test-app`. This also leaves screenshots disabled. To explicitly capture visual artifacts, use `npm run test:screenshots --workspace xahauname-test-app` (or append `--screenshots` to another browser script). `APP_TEST_URL` selects another instance. Provider approvals can be exercised in the browser with the configured wallet.

See the [SDK API](../docs/API.md), [architecture](../docs/ARCHITECTURE.md#domain-manager) and [artwork attribution](src/icons/README.md).
