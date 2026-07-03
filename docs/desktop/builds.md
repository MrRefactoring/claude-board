# Building from Source

Claude Board is a Tauri v2 app: React + Vite frontend (`client/`), Rust backend (`src-tauri/`). `bundle.targets` is `"all"` in `src-tauri/tauri.conf.json`, so `tauri build` produces every installer format supported by the host OS.

## Prerequisites

- Rust (stable toolchain)
- Node.js 18+ (CI uses Node 20)
- Platform-specific Tauri build dependencies (see Tauri v2 docs) — on Linux CI this is `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev`

## Build commands

```bash
npm run setup        # npm install at root + client/
npm run tauri:build   # npx tauri build
```

Tauri produces the standard bundle per host OS (NSIS `.exe` on Windows, `.dmg`/`.app` on macOS, `.AppImage`/`.deb` on Linux) under `src-tauri/target/release/bundle/`. Cross-compilation isn't supported natively — build on (or via CI for) each target platform.

Dev mode: `npm run tauri:dev` (`npx tauri dev`) — compiles the Rust backend, starts the Vite dev server (`npm run client`), opens the app window with frontend hot-reload.

## Bundled resources

The MCP sidecar (`src-tauri/resources/mcp-server.js`) is packaged via `bundle.resources` and located at runtime relative to the executable — see `docs/concepts/agents.md`.

## Icons

`bundle.icon` in `tauri.conf.json` lists: `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`. Regenerate all formats from a source image with `npx tauri icon <path>`.

## CI/CD

> **Note:** `.github/workflows/release.yml` — not `build.yml` — is the release workflow, and it only builds **Windows and macOS** (`x86_64-pc-windows-msvc`, `x86_64-apple-darwin`, `aarch64-apple-darwin`). There is currently no Linux job in CI; Linux builds must be produced manually via `tauri build` on a Linux machine.

- Triggers on tags matching `v*`.
- Per matrix entry: checkout → Node 20 setup → `npm ci` (root + `client/`) → `tauri-apps/tauri-action` build with Tauri updater signing (`TAURI_SIGNING_PRIVATE_KEY`) and Apple codesigning/notarization secrets.
- `includeUpdaterJson: true` — publishes `latest.json` for the built-in updater (`plugins.updater.endpoints` in `tauri.conf.json` points at the GitHub Releases asset).
- A separate job (`publish-notes`) runs `gh release edit --generate-notes` after all builds finish.
- `.github/workflows/ci.yml` (on PRs/push to `main`) runs lint, type-check, `vitest`, frontend build, and `cargo check`/`cargo clippy` — it does not produce installers.

## Key code

- `src-tauri/tauri.conf.json` — bundle config, icons, updater endpoint
- `.github/workflows/release.yml` — release build matrix
- `.github/workflows/ci.yml` — lint/test/build checks
