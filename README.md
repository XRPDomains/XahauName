# XahauName

An on-chain name service for Xahau. Give a wallet a readable name, publish a profile and receiving addresses, and use one identity across applications.

Domain ownership is represented by native URITokens. Canonical names, token mappings, addresses, text records and primary selections are stored on the ledger. Metadata and media provide the visual presentation of that identity.

## What you can build

- **Domain registration and management:** register names, claim incoming domains, create transfer offers and burn owned domains.
- **Wallet identity:** resolve an owner, list owned names and verify a wallet's primary name through its receiving-address record.
- **Public profiles:** publish Global Keys, service links, custom text records and multichain receiving addresses.
- **Domain-based content:** associate IPFS website content and metadata artwork with a name.
- **Application data services:** index validated ledgers and expose profiles, ownership and events through HTTP/SSE.

Names have no expiry or renewal. Transfer acceptance and burn clear the domain's indexed records and previous primary selection. Ownership checks use ledger state and the native token; metadata does not grant ownership. See the [protocol](docs/SPEC.md#1-identity-and-authority) for authority and lifecycle rules.

## Components

| Component | Purpose | Start here |
| --- | --- | --- |
| [Hooks](hook/README.md) | On-chain registration, ownership, records and lifecycle processing | [C handlers](hook/src/handlers/) |
| [SDK](packages/sdk/README.md) | Typed ledger reads, transactions, codecs and wallet integration | [Client source](packages/sdk/src/index.ts) |
| [Indexer](packages/indexer/README.md) | Validated-ledger replay, SQLite projections and event delivery | [Indexer source](packages/indexer/src/index.ts) |
| [Domain manager](test-app/README.md) | Wallet-connected interface for managing names and profiles | [Application source](test-app/src/app.ts) |
| [XNIP standards](docs/standards/README.md) | Shared conventions for names, records, addresses, primary names and avatars | [Standards registry](docs/standards/README.md#registry) |

The SDK, indexer and domain manager share network configuration. Network transport and a name-service deployment's treasury, namespace and hook hashes are configured separately; see [network configuration](docs/NETWORKS.md).

## Get started

Use Node.js 20+ and install from the repository root:

```sh
npm ci
npm run sdk:build
npm run app:dev
```

Open the [domain manager](http://127.0.0.1:5173/). During development it imports SDK source directly. [Static hosting](test-app/DEPLOY.md) is a separate build workflow.

To integrate an application, follow the [SDK quickstart](packages/sdk/README.md#quickstart). To run a data service, follow the [indexer quickstart](packages/indexer/README.md#quickstart). Hook contributors can start with the [build instructions](hook/README.md#build).

## Explore the source

Public libraries live in npm workspaces under [`packages/`](packages/README.md), alongside the C hooks, browser application and shared tooling.

| Path | Contents |
| --- | --- |
| [hook/src/](hook/src/) | Shared state/serialization helpers and ten C handlers |
| [hook/config/handlers.json](hook/config/handlers.json) | Canonical hook-chain order |
| [packages/sdk/src/](packages/sdk/src/) | SDK modules, protocol parameters and record codecs |
| [packages/indexer/src/](packages/indexer/src/) | Ledger source, decoder, projection and storage |
| [test-app/src/](test-app/src/) | Application views, wallet session and domain-management flows |
| [deployments/](deployments/) | Public deployment manifests and validation records |
| [scripts/](scripts/) | Hook builds, workspace verification and release tooling |

The [architecture and source guide](docs/ARCHITECTURE.md) follows a registration, a profile update and an indexed event through these components.

[Runnable integration examples](docs/examples/README.md) show profile/portfolio resolution at one ledger snapshot and cursor-based indexer reads.

## Documentation

- [Documentation index](docs/README.md): guides by task and audience.
- [Protocol specification](docs/SPEC.md) and [hook function reference](docs/HOOK-FUNCTIONS.md).
- [SDK API](docs/API.md), [wallet integration](docs/WALLET-INTEGRATION.md) and [indexer reference](docs/INDEXER.md).
- [Workspace and package maintenance](docs/PACKAGES.md), [contributing](CONTRIBUTING.md) and [review records](docs/review/README.md).

## License

[MIT](LICENSE). Third-party artwork attribution is recorded with the [icon assets](test-app/src/icons/README.md).
