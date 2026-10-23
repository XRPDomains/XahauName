# Testnet recovery deployment

Date: 2026-10-23. Network21338; treasury `rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs`.

SetHook [F6C1A8F4EE7AD80E829A5C823B716F0F177E5F65DA30256FD7AEB69EB13593B1](https://test.xahauexplorer.com/explorer/F6C1A8F4EE7AD80E829A5C823B716F0F177E5F65DA30256FD7AEB69EB13593B1) validated `tesSUCCESS` at ledger13419939. Fee34.912510 testnet XAH; no retry. All ten hashes/effective masks match [the manifest](../../deployments/testnet.json). Maximum WASM12,976 bytes; all ten static guard checks and272 production-WASM probes pass. Pricing/URIBase and62 namespace entries stayed byte-identical.

Two fresh wallets completed54 live SDK checks: buy/register, claim, ten-key atomic profile, custom/service texts, six address codecs, verified primary, IPFS content, transfer-offer discovery/cancellation, transfer cleanup, reset, burn and reconciliation. Both temporary domains were burned; final namespace exactly matches the62-entry baseline. Read-only indexer bootstrap at ledger13420151 reports12 claimed domains, no temporary domains.

Smoke [A640BB5C3EF089A0BE0CA4D53E174DDF84999FE796D620565A150ADACBA14B0F](https://test.xahauexplorer.com/explorer/A640BB5C3EF089A0BE0CA4D53E174DDF84999FE796D620565A150ADACBA14B0F) validated `tesSUCCESS`: eight executions, each `HookResult=3`, `HookReturnCode=0`, `HookReturnString="not v2"`. See [public trace and transaction hashes](../../deployments/testnet-recovery-validation.json).

Live testing exposed missing treasury Destination in the new SDK reconcile method. The suite stopped with `HOOK_NOT_EXECUTED`; that validated Invoke changed no hook/token state. SDK routing was fixed, ordinary-wallet/treasury regressions pass, and a guarded checkpoint resume retained the failed acknowledgement without repeating purchase/claim. Corrected reconciliation and repeated completed-burn reconciliation passed. All37 signed live transactions validated tesSUCCESS; one is the retained pre-fix no-hook Invoke. SDK78, indexer38 and app143 offline tests pass.

SDK preset is updated; npm changes are unpublished. Controlled native fault-injection recovery remains a production gate. No frontend production build or mainnet transaction occurred. Dev UI: http://127.0.0.1:5173/.
