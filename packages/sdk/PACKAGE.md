# Package maintenance

The package exports CJS, ESM and TypeScript declarations from dist. Source, README, changelog and MIT license are included by an explicit package allowlist. Environment files, local test reports and deployment signing material are excluded.

From the repository root, run `npm ci`, `npm run packages:test`, `npm run lint --workspace @xahauname/sdk` and `npm run release:check`. The [workspace maintenance guide](../../docs/PACKAGES.md) describes synchronized version preparation and publication. The protocol API is documented in [the API reference](../../docs/API.md); [the quickstart](README.md) covers integration.

The app uses SDK source during development. It does not require a production build or an IIFE for each edit. A future standalone script-tag distribution should be versioned separately and tested for browser globals and wallet-provider lifecycle before publication.
