# Packages

Public developer libraries live under `packages/*`; npm automatically links these workspaces during a root install. The test application is a private workspace. The C hook and its isolated Docker compiler remain under `hook/`.

| Folder | npm package | Purpose |
| --- | --- | --- |
| [sdk](sdk/README.md) | `@xahauname/sdk` | Ledger reads, record standards, transactions and wallet integration |
| [indexer](indexer/README.md) | `@xahauname/indexer` | Validated replay, SQLite read model and event API |

Run commands from the repository root:

```sh
npm ci
npm run packages:build
npm run packages:test
npm run app:test
npm run app:dev
npm run release:check
```

There is one root `package-lock.json`. Do not add lockfiles to individual workspaces. `hook/toolchain/package-lock.json` is intentionally independent because Docker builds that compiler in isolation.

## Adding a library

Add `packages/<name>/package.json` with a unique `@xahauname/` name, the current root version, build/test scripts, an explicit files allowlist, CJS/ESM/types exports, MIT license and README. Set `repository.directory` to its repository path and `publishConfig` to public access on `https://registry.npmjs.org/`. Reference sibling libraries using ordinary semver versions; avoid file/link/workspace protocols in publishable dependency declarations. Run root `npm install` to update the shared lock.

`release:check` discovers packages automatically, builds in dependency order, validates synchronized metadata/internal dependency versions and checks npm tarball contents. It does not build the frontend or publish anything.

## Synchronized release preparation

```sh
npm run release:version -- 0.3.1
npm run packages:test
npm run app:test
npm run repo:test
npm run app:typecheck
npm run release:check
```

The version command updates the root, package/application versions, sibling dependency ranges and shared lock. It creates no Git commit, tag or npm publication. Review changelogs and deployment compatibility separately; synchronized npm versions do not imply a hook upgrade.

Only after explicit maintainer authorization and the open [review gates](../docs/review/OPEN-CODE-REVIEW.md) are resolved should a release be published. SDK must be published before indexer because indexer declares the SDK peer dependency:

```sh
npm publish --workspace @xahauname/sdk
npm publish --workspace @xahauname/indexer
```

These commands publish to npm. They are documentation, not part of build, CI or the current reorganization. The root and test app are private; never publish the full repository. Configure registry authentication/trusted publishing separately; no registry tokens belong in Git.
