# Network and deployment configuration

All reusable client packages share the SDK's `XAHAU_NETWORKS` and `resolveNetworkConfig`. No handler, decoder, balance resolver or signer should infer testnet from a treasury address.

| Setting | Testnet | Mainnet |
| --- | --- | --- |
| Profile name | `testnet` | `mainnet` |
| NetworkID | 21338 | 21337 |
| Public WebSocket | `wss://xahau-test.net` | `wss://xahau.network` |
| Wallet Kit ID | `xahau-testnet` | `xahau-mainnet` |
| Bundled name-service deployment | Reviewed testnet deployment | Not deployed/configured |

Transport values follow the [official Xahau node configuration](https://xahau.network/docs/infrastructure/installing-xahaud/). SLIP-0044 XAH coin type stays **21337 on both networks**; it is not the testnet NetworkID.

```ts
import {resolveNetworkConfig, XahauNameClient} from '@xahauname/sdk';
const config = resolveNetworkConfig({network: 'testnet'});
const client = new XahauNameClient(config);
```

The same `config` is accepted by `createIndexer({network: config, storage})`. To use a private/archival endpoint, provide `wss`; actual network identity is checked on connection.

## Mainnet switch

Once a separately reviewed mainnet deployment exists, supply its public SDK-shaped manifest:

```ts
const config = resolveNetworkConfig({network: 'mainnet', deployment: {
  expectedNetworkId: 21337,
  treasury: mainnetManifest.treasury,
  namespaceId: mainnetManifest.namespaceId,
  hookHashes: mainnetManifest.hookHashes,
}});
```

Mainnet without this deployment fails clearly. A testnet manifest with NetworkID 21338 is rejected. The resolver never silently substitutes testnet treasury/namespace/hashes. The published testnet profile remains backward compatible; new code should use the resolver rather than importing `TESTNET_V2`.

For the local example indexer server:

```text
XAHAU_NETWORK=mainnet
XAHAU_DEPLOYMENT_FILE=/absolute/path/to/mainnet-client.json
XAHAU_INDEX_DB=/absolute/path/to/mainnet.sqlite
```

`mainnet-client.json` contains the deployment object above, not private signing material. Use separate databases per network/deployment; storage identity prevents accidental reuse.

For the Vite test app:

```text
VITE_NETWORK=mainnet
VITE_DEPLOYMENT_JSON={"treasury":"<mainnet address>","namespaceId":"<64 hex>","expectedNetworkId":21337,"hookHashes":{"issuance":"<64 hex>","claim":"<64 hex>","profile":"<64 hex>"}}
```

Supply all installed handler hashes in real use. `VITE_WSS` optionally overrides the transport. These values are public and bundled into a production frontend; never put a seed in a `VITE_` variable. Dev mode reads them after a Vite restart. Existing production bundles need an explicit rebuild to change Vite environment values. Signing network, balance requests, reader/writer deployment, explorer links, faucet visibility and page network labels follow this configuration.

## Deployment is a separate operation

The current `hook/deploy/testnet.cjs` and live transaction tests are intentionally testnet-only. They are not generic mainnet deploy commands. Changing a client preset does not install hooks or create a treasury on mainnet. Mainnet deployment/HSM handling and the open native weak-phase recovery gate require their own release work.
