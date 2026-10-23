# Review and verification records

Engineering reviews, verification scope, design assessments and deployment evidence. Product introductions are in component READMEs; normative behavior is defined by the [protocol](../SPEC.md), [API reference](../API.md) and [XNIP registry](../standards/README.md).

## Status and coverage

| Document | Purpose |
| --- | --- |
| [Findings register](FINDINGS.md) | Current disposition of correctness and reliability findings |
| [Test matrix](TEST-MATRIX.md) | Automated coverage and manual/native verification scope |
| [Full source review](OPEN-CODE-REVIEW.md) | Review method, original findings and source coverage |
| [Lifecycle/client follow-up](RECOVERY-AND-CLIENT-FIXES.md) | Implementation changes and verification evidence |
| [Owner-only burn](OWNER-ONLY-BURN.md) | Native custody authorization, upgrade boundary and testnet rejection/success receipts |

## Architecture and integration assessments

| Document | Purpose |
| --- | --- |
| [Indexer implementation](INDEXER.md) | Implementation evidence and scaling/operations scope |
| [Events and indexing](EVENTS-AND-INDEXING.md) | Ledger transport and event architecture assessment |
| [Error presentation](ERROR-UX.md) | User-facing messages and ledger/hook diagnostics |
| [Wallet Kit integration](WALLET-KIT-INTEGRATION.md) | Direct SDK versus manager/adapter signing, metadata ownership and acceptance scope |
| [Ledger read performance](READ-PERFORMANCE.md) | Measured list/search latency, duplicate reads and snapshot loading |
| [SDK/Wallet Kit RPC audit](SDK-RPC-AUDIT.md) | Primary/polling reductions, signing traces and proposed Kit changes |
| [Workspace organization](WORKSPACES.md) | Package layout, dependencies and tarball verification |

## Deployment and release evidence

| Record | Scope |
| --- | --- |
| [Release 0.3.0](releases/0.3.0.md) | Original release identity and validation |
| [Lifecycle recovery deployment](TESTNET-RECOVERY-DEPLOYMENT.md) | Recovery-extension deployment and live SDK validation |
| [Public manifests](../../deployments/) | Installed identities and compact validation records |

Reports record their own date, deployment and method. Use the findings register for current disposition; historical reports preserve their original scope. Unit/model checks, normal live transactions and controlled native fault injection are distinct kinds of evidence.

Generated artifacts and detailed receipts stay in ignored `hook/build/current/`. Compact source-controlled records link to implementation and deployment identities.
