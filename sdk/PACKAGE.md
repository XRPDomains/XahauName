# Package maintenance

The package exports CJS, ESM and TypeScript declarations from dist. Source, README, changelog and MIT license are included by an explicit package allowlist. Environment files, local test reports and deployment signing material are excluded.

Run npm ci, npm test, npm run lint, then npm pack --dry-run. Publishing is a separate maintainer action. The protocol API is documented in [the API reference](../docs/API.md); [the quickstart](README.md) covers ordinary integration.

The app uses SDK source during development. It does not require a production build or an IIFE for each edit. A future standalone script-tag distribution should be versioned separately and tested for browser globals and wallet-provider lifecycle before publication.
