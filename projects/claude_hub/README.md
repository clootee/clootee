# Clootee

[English](../../README.md) · [中文使用说明](../../README_zh.md)

Clootee runs Claude Code and Codex through a local browser interface. Start with the platform launcher in the repository root. Configuration and sessions remain in your local data directory.

## Frontend builds

The normal backend build also bundles the browser UI into `frontend/dist` using only Node built-ins.
Charts, spreadsheets, the code editor, and QR codes load when used. The server serves precompressed
files and caches content-hashed assets for one year; HTML is revalidated on each visit. Source files
and generated bundles are kept separately, and generated files should not be committed.

```sh
cd projects/claude_hub/backend
pnpm run build
```

No CDN account is required: default builds load everything from the same server, including over
LAN HTTP. For a separate static host, run `node scripts/build-web.cjs ROOT OUTPUT HTTPS_CDN_BASE`
from the repository root. Upload the generated static files with the correct JS/CSS content types,
public read access, CORS for GET, and immutable caching before publishing the generated HTML.
When uploading `.gz` files without that suffix, set `Content-Encoding: gzip`.
The loader verifies SHA-256 and falls back to the local `/static/` copy if the CDN is unavailable.
Keep old hashed files available for browser tabs opened before an update.

For a TLS reverse proxy, set `CLOOTEE_LOOPBACK_ONLY=1` to keep the backend port on
localhost even when remote access is enabled. Enable remote access in Settings and
keep a security password configured; the proxy handles the public HTTPS connection.

After building, run `node --test scripts/release/web-assets.test.cjs` from the repository root
to check bundle integrity, HTTP compression, caching, and source/API fallback.
