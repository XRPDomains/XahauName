# XahauName

A native name service for Xahau. Canonical names, ownership mappings, addresses, profiles and primary selections live in ledger state. URITokens represent ownership; images and website content can be hosted externally.

**Release 0.3.0 targets Xahau testnet.** No mainnet deployment is included. Names have no expiry or renewal.

SDK, indexer and the domain manager share [network/deployment configuration](docs/NETWORKS.md). Mainnet transport is predefined; its own reviewed deployment must be supplied before use. The [indexer package](indexer/README.md) provides an initial SQLite read model and HTTP/SSE example for development.

## Repository

| Path | Purpose |
| --- | --- |
| hook/src/ | Shared C helpers and ten bounded handlers |
| hook/toolchain/ | Pinned compiler configuration and checker checksums |
| hook/deploy/ | Journaled testnet upgrade |
| hook/test/ | Production-artifact model tests |
| sdk/ | TypeScript SDK, codecs and wallet integration |
| indexer/ | Validated-ledger decoder, SQLite read model, event outbox and local API |
| test-app/ | English domain manager with Wallet Kit |
| docs/ | Protocol, function reference, SDK API and XNIP standards |
| deployments/ | Public deployment identity and validation summary |
| scripts/ | Build and verification commands |

## Development

Use Node.js 20+ (22 recommended). Install packages independently:

```sh
npm ci --prefix sdk
npm ci --prefix test-app
npm run sdk:test
npm run app:test
npm run app:dev
```

Vite uses SDK source during development. A frontend production build is separate and explicit: `npm --prefix test-app run build`.

Hook builds require Docker and the native checker. Follow [hook development](hook/README.md) and [testnet deployment](hook/DEPLOY-TESTNET.md).

## Documentation

Start with the [documentation index](docs/README.md), [protocol](docs/SPEC.md), [SDK quickstart](sdk/README.md) and [standards registry](docs/standards/README.md). Installed hashes and public addresses are in [the deployment manifest](deployments/testnet.json).

## Authority and limits

The treasury controls upgrades, pricing, enabled TLDs, registration pause, URIBase and administrative reset. Tokens are burnable by their issuer. These powers require assessment before production use; the service does not provide immutable governance guarantees.

Ownership and records are on-chain. HTTPS metadata and images can change independently, and gateways may be unavailable. Changing URIBase affects future mints only. Neither metadata nor avatar content determines ownership.

This release has bounded record counts and a shared treasury namespace. Million-domain capacity has not been load-tested. See the specification for limits and migration constraints.

MIT licensed; see [LICENSE](LICENSE).

Current assurance status and open production gates are tracked in [review findings](docs/review/FINDINGS.md) and [the test matrix](docs/review/TEST-MATRIX.md).

The latest [full source review](docs/review/OPEN-CODE-REVIEW.md) records two high and two medium open findings. This remains a development/testnet release.
