# Static testnet deployment

Development uses npm run dev and SDK source. Build only when a server release is requested.

```sh
npm ci
npm --prefix test-app run build
```

For an FTP release under `/xahauname/`, run from the repository root in PowerShell:

```powershell
./test-app/scripts/package.ps1
```

This builds with `--base=/xahauname/` and prepares `test-app/release/xahauname/`, including the app and Docs, without a ZIP. Upload the entire `xahauname` folder into the server's web root. The public URLs are `https://your-host/xahauname/` and `https://your-host/xahauname/docs/`. If `/xahauname/` already exists remotely, upload the folder's contents into it rather than creating another nested `xahauname` folder.

For another hosting path, use `node test-app/scripts/build.mjs --base=/your-path/` and upload the contents of `test-app/dist/` there. Without `--base`, relative assets are used. The app uses hash routes such as `#/find` and `#/name/alice.xah/records`; no SPA catch-all or server rewrite is needed. Legacy `?domain=` registration links remain supported.

The build includes a `docs/` directory containing prerendered HTML, CSS, JavaScript and its search index. Upload the full directory with the app. Configure `index.html` as the directory index so `/docs/` and `/docs/read/` work. No Markdown renderer or Node.js runtime is needed on the server. Docs use the same selected network/deployment settings as the application at build time.

Revalidate Docs HTML, the search index and the unversioned Docs CSS/JavaScript on updates; reserve immutable caching for hashed app assets.

Register that origin/redirect with the Xaman application and permit Xyra popups. Verify provider approval on the actual HTTPS origin. Keep index.html short-lived in cache and hashed assets long-lived.

Do not upload environment files, repository source, dependencies, tests or signing material. No backend signer/database is needed. Metadata JSON/images must be reachable with suitable CORS or through the existing same-origin API. vite preview is a local test server, not production hosting.
