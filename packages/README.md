# XahauName packages

Developer libraries for integrating XahauName into wallets, applications and data services. The packages share network/deployment configuration and are maintained as npm workspaces.

## Libraries

| Package | Use it for | Main source |
| --- | --- | --- |
| [@xahauname/sdk](sdk/README.md) | Resolve names and profiles, submit domain operations, encode records and connect a signer | [sdk/src/index.ts](sdk/src/index.ts) |
| [@xahauname/indexer](indexer/README.md) | Replay validated ledgers, maintain a read model and deliver events | [indexer/src/index.ts](indexer/src/index.ts) |

The SDK can read the ledger directly. The indexer adds a query/event layer and uses the SDK's configuration and domain conventions. Wallet signing remains with the application and its signer.

The [domain manager](../test-app/README.md) is a private application workspace that demonstrates SDK and Wallet Kit integration. The [C hooks](../hook/README.md) have a separate Docker toolchain.

## Workspace development

Run from the repository root:

```sh
npm ci
npm run packages:build
npm run packages:test
npm run app:dev
```

One root lockfile covers the client workspaces, and npm links sibling packages during installation. Libraries export CommonJS, ESM and TypeScript declarations.

## Integration guides

- [SDK quickstart](sdk/README.md#quickstart) and [complete API](../docs/API.md).
- [Indexer quickstart](indexer/README.md#quickstart) and [HTTP/event reference](../docs/INDEXER.md).
- [Shared network configuration](../docs/NETWORKS.md).
- [Architecture and source guide](../docs/ARCHITECTURE.md).

## Package maintenance

The [workspace maintenance guide](../docs/PACKAGES.md) covers adding a package, dependency declarations, synchronized versions, tarball checks and publication order. Build/package commands operate on libraries; the browser production build has its own [hosting workflow](../test-app/DEPLOY.md).
