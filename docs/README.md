# XahauName documentation

Guides and references for integrating, operating and extending XahauName. Start with a task, then follow protocol and source links for implementation details.

## Start by task

| Task | Guide |
| --- | --- |
| Understand the system and find its implementation | [Architecture and source guide](ARCHITECTURE.md) |
| Add domain actions to an application | [SDK quickstart](../packages/sdk/README.md#quickstart) |
| Run a source example for profile or event reads | [Integration examples](examples/README.md) |
| Connect a browser wallet | [Wallet integration](WALLET-INTEGRATION.md) |
| Run the domain-management interface | [Domain manager](../test-app/README.md#run-locally) |
| Build a read model or event service | [Indexer quickstart](../packages/indexer/README.md#quickstart) |
| Select a network, endpoint and deployment | [Network configuration](NETWORKS.md) |
| Describe HookState on XahauWin | [Explorer manifests and coverage](../explorer/README.md) |
| Build the on-chain implementation | [Hook guide](../hook/README.md) |
| Maintain packages and prepare releases | [Workspace maintenance](PACKAGES.md) |

## Reference

| Document | Contents |
| --- | --- |
| [Protocol specification](SPEC.md) | Names, operations, authority, state and lifecycle rules |
| [Hook functions](HOOK-FUNCTIONS.md) | C entry points, buffers, helpers and handler responsibilities |
| [SDK API](API.md) | Client, registrar, resolver, codecs and signing interfaces |
| [Indexer reference](INDEXER.md) | HTTP/SSE, events, checkpoints and storage |
| [XNIP registry](standards/README.md#registry) | Name, record, address, primary and avatar conventions |

## Operations and verification

See the [hook deployment guide](../hook/DEPLOY-TESTNET.md) and [application hosting guide](../test-app/DEPLOY.md) for operational procedures. Public addresses, installed hashes and network identities live in [deployments/](../deployments/).

[Review records](review/README.md) contain validation scope, findings, coverage and deployment evidence. These records complement the protocol/API reference rather than defining its behavior.

XNIPs have their own proposal status and version. The [proposal process](standards/xnip-0000-process.md) describes progression from Draft to Final.
