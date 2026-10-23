# Workspace reorganization verification

Date: 2026-10-23. Structural/package-tooling change only; hook C, domain protocol, deployed artifacts and application transaction behavior are unchanged.

Public libraries moved to `packages/sdk` and `packages/indexer`. The private test app participates in the root npm workspace. One root lockfile replaces three client lockfiles; the Docker compiler retains its separate pinned lock. Sibling dependencies use registry-compatible semver rather than file URLs.

Updated package metadata, public registry configuration, prepack builds, imports, live-verification/deploy-generator paths, hook-test module resolution, dev aliases, documentation and CI. Release checks discover public packages and build in dependency order, check version/metadata alignment and validate tarball exports/allowlists. Version preparation updates root/workspaces/internal ranges/lock without committing, tagging or publishing.

| Verification | Result |
| --- | --- |
| Hook WASM probes with relocated dependency resolution | 216/216 pass |
| SDK suite | 71/71 pass |
| Indexer suite, including native SQLite and HTTP/SSE | 27/27 pass |
| App suite and TypeScript | 129/129 pass; typecheck pass |
| Browser smoke using new Vite SDK source alias | 16 checks pass |
| Release-version fixture tests | 3/3 pass, including failed-lock rollback |
| npm pack dry-run | Both public packages pass entrypoint/private-file checks |
| Separate consumer installed from actual SDK/indexer tarballs | CommonJS, ESM and native SQLite pass without monorepo source imports |
| Shared lock/package versions and local Markdown links | Pass |

Dependency installation reported zero audit vulnerabilities at the time of this check. Existing transitive deprecation warnings and Xaman SDK's npm-engine warning under local npm 11 remain dependency warnings; no audit-fix upgrade was applied.

No npm publication, frontend production build, live signing or hook redeployment occurred. The four open [full-review findings](OPEN-CODE-REVIEW.md) are not resolved by reorganizing folders. Local dependency backups and consumer tarballs remain outside Git.
