# Workspace and package maintenance

The repository uses npm workspaces for public libraries under [packages/](../packages/README.md) and the private [domain manager](../test-app/README.md). Run the commands below from the repository root.

## Workspace layout

The root [package.json](../package.json) declares packages/* and test-app. One root [package-lock.json](../package-lock.json) covers all client workspaces. The [hook compiler lockfile](../hook/toolchain/package-lock.json) is independent because Docker builds that toolchain in isolation.

The SDK is the common configuration/protocol dependency. The indexer declares a compatible SDK peer and a local development dependency. The application uses the SDK workspace. Publishable dependency declarations use ordinary semver ranges so consumers can resolve them outside the repository.

## Build and verify

```sh
npm ci
npm run packages:build
npm run packages:test
npm run app:test
npm run app:typecheck
npm run repo:test
npm run release:check
```

[check-packages.mjs](../scripts/check-packages.mjs) discovers packages, builds in dependency order, validates synchronized metadata and dependency ranges, and checks npm tarball contents. These commands do not build the frontend or publish packages.

## Add a library

1. Create packages/<name>/package.json with a unique @xahauname/ name and the current root version.
2. Provide build/test scripts, CJS/ESM/type exports, an explicit files allowlist, README and MIT license.
3. Set repository.directory to the package path and configure public access on https://registry.npmjs.org/.
4. Declare sibling dependencies with compatible semver ranges, then run npm install at the root to update the shared lockfile.
5. Run the build, tests and release checks above.

## Version preparation

```sh
npm run release:version -- 0.3.1
npm run packages:test
npm run release:check
```

[version-packages.mjs](../scripts/version-packages.mjs) updates root, package/application versions, sibling ranges and the shared lockfile. Review changelogs and deployment compatibility with the prepared version. Package versions and native hook deployment identities have separate lifecycles.

## Publication

Publish the SDK before the indexer to satisfy its SDK peer dependency:

```sh
npm publish --workspace @xahauname/sdk
npm publish --workspace @xahauname/indexer
```

Publication is a maintainer release operation, separate from build/CI. The root and application workspaces are private. Keep registry credentials and signing material outside tracked source. Release verification records are organized in [docs/review/](review/README.md); network and deployment identity are described in [NETWORKS](NETWORKS.md).
