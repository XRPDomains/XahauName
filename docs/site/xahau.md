# Xahau foundations

Xahau is an XRPL-derived ledger with Hooks. XahauName uses native ledger objects and C/WASM Hooks for its name-service rules.

## The building blocks

| Building block | Role in XahauName |
| --- | --- |
| Hooks | Validate operations and maintain shared on-chain state |
| HookState | Store names, records, mappings and lifecycle progress |
| URITokens | Represent native ownership of each domain |
| Payment | Pay the registrar for a name |
| Invoke | Submit record and configuration updates through HookParameters |
| URITokenBuy | Claim a registration or accept a restricted transfer offer |
| Emitted transactions | Queue mint, offer and refund stages with callbacks |

## Confirmation is a lifecycle

A successful purchase Payment does not mean the recipient owns the name yet:

1. Payment reserves the name and queues minting.
2. The mint callback queues a recipient-restricted offer.
3. The recipient signs a claim; ownership finalizes on the ledger.

Use `getDomain()` for progress. Check validated transaction metadata and hook execution results, not only a wallet popup or submitted hash.

## Network and amounts

XAH is Xahau's native asset. **1 XAH = 1,000,000 drops.** Keep monetary amounts as integer drops or `bigint`, not floating-point values.

Testnet NetworkID is `21338`; mainnet is `21337`. XAH's address coin type is `21337` on both networks. A coin type and a network ID serve different purposes.

## Official references

- [Hooks introduction](https://xahau.network/docs/hooks/concepts/introduction/)
- [Native URITokens](https://xahau.network/docs/features/network-features/uritoken/)
- [Strong and weak execution](https://xahau.network/docs/hooks/concepts/weak-and-strong/)
- [Emitted transactions](https://xahau.network/docs/hooks/concepts/emitted-transactions/)
