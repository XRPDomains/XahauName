# Integration examples

Small read-only programs showing SDK and indexer consumption. They use the public workspace packages and shared network configuration; no wallet or signing material is needed.

## Run from the repository

```sh
npm ci
npm run sdk:build
node docs/examples/read-profile.mjs alice.xah
```

[read-profile.mjs](read-profile.mjs) reads a domain profile, receiving address, owner portfolio and verified primary at one validated ledger hash. Output includes that hash so the related reads share an explicit snapshot.

For independent verification without XahauName SDK, run `node docs/examples/verify-domain.mjs web3domains.xah`. [verify-domain.mjs](verify-domain.mjs) uses the generic `xahau` RPC/codec library and Node crypto, verifies the configured hook chain and domain/token identity at one validated ledger, and refuses unresolved tracking. It never signs. An optional second argument selects a public deployment manifest in the shape used by `deployments/testnet.json` (`rpc`, `networkID`, `treasury`, `namespace`, ordered `handlers`). Missing root is not proof that a pending name is available.

With the [indexer service](../../packages/indexer/README.md#serve-http-and-events) running:

```sh
node docs/examples/read-events.mjs 0
```

[read-events.mjs](read-events.mjs) requests one event page after a cursor and retains the service's status/checkpoint metadata. Process events and store their cursor before requesting the next page; use the [event reference](../INDEXER.md#event-schema-v1) for delivery semantics.

## Configuration

[config.mjs](config.mjs) selects the bundled network/deployment by default and accepts:

| Environment variable | Purpose |
| --- | --- |
| XAHAU_NETWORK | Network profile: testnet or mainnet; defaults to testnet |
| XAHAU_DEPLOYMENT_FILE | JSON client deployment configuration for the selected network |
| XAHAU_WSS | Optional WebSocket endpoint override |
| XAHAU_INDEXER_URL | HTTP service URL for the event example |

Set environment variables in the shell; the examples do not load an environment file automatically. Mainnet requires an explicit deployment configuration. See [network configuration](../NETWORKS.md) for the JSON shape.

For signing and record updates, follow the [SDK integration examples](../../packages/sdk/README.md#connect-a-wallet-signer) and [domain-manager source](../../test-app/README.md#source-guide).
