# Testnet audit refactor deployment

Date: 2026-10-24. Network 21338; treasury `rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs`.

The ten-artifact refactor passed SetHook simulation and validated installation with `tesSUCCESS`. [Install transaction](https://test.xahauexplorer.com/explorer/6E6B6F12658E023DBE6DEC5C49DA5A58E21F2ED7D6CA7BC7735A8D4900F82512). Fee: 35.099010 testnet XAH. One submitted install; no resubmission. Installed hashes, bytecode, namespace, API version and effective HookOn/HookCanEmit masks match the [deployment manifest](../../deployments/testnet.json). Owner-only burn gating remains enabled.

All 84 HookState entries were byte-identical before and after installation and smoke. Pricing and URIBase were preserved without bootstrap writes. A verified SDK profile read of `web3domains.xah` returned its pre-upgrade owner. The generated SDK deployment preset now contains the installed hashes; CJS/ESM outputs were rebuilt.

[Smoke transaction](https://test.xahauexplorer.com/explorer/A3DC72E9186A15B9FDE3D52B6732A1ECA1B0A748C7E9662AF4DF054836018045) is a bare 12-drop Payment to an existing test wallet. It validated `tesSUCCESS` with eight hook executions, each `HookResult=3`, `HookReturnCode=0` and `HookReturnString="not v2"` (raw strings retain their terminating NUL). No domain/profile transaction was submitted during this upgrade check. [Public validation summary and execution trace](../../deployments/testnet-audit-validation.json).

All ten static checks and 283 production-WASM model probes passed before installation; maximum artifact size is 13,382 bytes. Detailed local build, simulation, before/after state and receipt evidence is retained under ignored `hook/build/current/audit-refactor-20261024/`.

The local Vite development server is available at http://127.0.0.1:5173/ and was verified to serve the updated SDK hash preset. No frontend production build, screenshot run, npm publication or mainnet transaction occurred. Controlled native weak-phase fault injection remains an open production assurance gate, as described in the [repair report](AUDIT-REPAIRS-2026-10-24.md).
