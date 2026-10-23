# Hook development

Canonical source is src/common.h plus src/handlers/*.c; order is config/handlers.json. There is no deployable monolithic artifact. See [the protocol](../docs/SPEC.md) and [function reference](../docs/HOOK-FUNCTIONS.md).

## Build and verify

Requires Node.js 20+, Docker and g++17. Windows uses WSL Ubuntu for the native checker. Run from repository root:

```sh
docker build -t xahauname-hook-toolchain:cli-3.0.0 hook/toolchain
node scripts/setup-guard.mjs
node scripts/build-hooks.mjs
node scripts/test-hooks.mjs
node hook/test/deployment.cjs
```

The image uses the versioned npm lock. Compilation needs no network after image creation. A single handler rebuild uses `node scripts/build-hooks.mjs --part profile`; common-header changes require all ten.

Output: ignored hook/build/current/<handler>/, with cleaned WASM/hex, compiler/native-checker logs and source/artifact checksums. Production artifacts are checked before copied probe modules receive test-only memory exports. Models do not prove ledger emission or install behavior; live testnet validation is separate.

Pinned tools: hooks-compiler 0.2.0 and hooks-cli 3.0.0. The cleaner retains hook/cbak but removes helpers; version-checked inlining handles this. The checker is unchanged upstream code with checksums in toolchain/guard-sources.json. Each artifact must be below 65536 bytes and satisfy native instruction and 32-block limits. No checker weakening or arbitrary guard increases are used.

DOCKER_BIN and GUARD_CHECKER select equivalent local executables. Build evidence stays local; the public deployment manifest records installed hashes/sizes.

Source checksums cover the exact local common-header plus handler snapshot; Git line-ending normalization can change this source checksum. The WASM SHA256 and installed HookHash identify the production code. Rebuild proofs for the actual checkout before upgrading.
