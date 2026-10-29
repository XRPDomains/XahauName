# Architecture

Ten small C/WASM handlers share one HookState namespace on the treasury account. The split keeps each artifact within execution, guard and size budgets.

## Handler responsibilities

| Handler | Responsibility |
| --- | --- |
| issuance | Register/buy, pending state, mint/offer/refund emissions and callbacks |
| set-address | Write or clear a receiving address and its index entry |
| authorization | Verify root and native ownership for mutations |
| set-text | Write a text record and custom-key descriptors |
| clear-text | Remove a text record and its descriptors |
| control | Set primary or reset a profile |
| admin | Pricing, TLDs, issuance pause and URI base |
| claim | Finalize claim/transfer and reconcile lifecycle cleanup |
| burn | Check native owner, then clean identity and records after burn |
| profile | Apply an atomic batch of Global Key changes |

Only issuance emits transactions. Ordinary profile updates use a signed Invoke. Transfer uses a restricted offer followed by the recipient's native claim.

## Repository map

| Directory | Contents |
| --- | --- |
| `hook/src/` | Shared C helpers and handlers |
| `hook/config/handlers.json` | Canonical handler order |
| `packages/sdk/` | Read/write client, codecs and wallet signing contract |
| `packages/indexer/` | Optional ledger-derived projections and events |
| `test-app/` | Browser domain manager and static Docs |
| `docs/standards/` | Versioned XNIP conventions |
| `deployments/` | Public network and deployment manifests |

## Integration boundary

Application → SDK → Xahau RPC for reads. Application → SDK → wallet signature → native transaction for writes. The hook enforces permissions and updates ledger state.

The indexer accelerates discovery; it does not replace on-chain ownership. Metadata supplies presentation; it does not authorize actions.

Explore the [source](https://github.com/XRPDomains/XahauName) or [Hook & raw operations](hook.md) for C responsibilities, wire bytes and state-key derivation.
