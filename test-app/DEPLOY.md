# Static testnet deployment

Development uses npm run dev and SDK source. Build only when a server release is requested.

```sh
npm ci
npm --prefix test-app run build
```

Upload only contents of test-app/dist/ to an HTTPS directory, for example https://xrpdomains.xyz/xahauname-testnet/. This is a suggested location, not a publication performed by this repository. Relative Vite asset paths support a subfolder. The app uses query parameters; no SPA catch-all is needed.

Register that origin/redirect with the Xaman application and permit Xyra popups. Verify provider approval on the actual HTTPS origin. Keep index.html short-lived in cache and hashed assets long-lived.

Do not upload environment files, repository source, dependencies, tests or signing material. No backend signer/database is needed. Metadata JSON/images must be reachable with suitable CORS or through the existing same-origin API. vite preview is a local test server, not production hosting.
