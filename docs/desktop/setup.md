# Desktop Setup

First-launch setup wizard (`client/public/setup.html`, a standalone HTML/JS view — not part of the main React app) shown when no `config.json` exists yet. Backed by Tauri commands in `src-tauri/src/setup.rs`.

## Behavior

`lib.rs`'s `setup` hook checks for a config file: if present, it goes straight to the main window; if absent, it opens a dedicated `setup` webview window (`setup.html`, 620×720, undecorated) instead.

## Wizard steps

6 steps (`N=6` in `setup.html`), not a fixed language-selection step — language is chosen inline on step 0:

1. **Welcome** — logo, language toggle (English / Türkçe), feature pills. No separate "language selection" step.
2. **System Check** — calls `check_system(port)`: verifies `claude` on PATH, `git` on PATH, the chosen port is free, and (optional, non-blocking) `gh` CLI presence + `gh auth token`. There is no Node.js check.
3. **Storage** — data directory (`get_default_dir` prefills it, `browse_folder` opens a native picker) and server port in one step, not two.
4. **First Project** — name + working directory, plus collapsible sections for Permissions (auto-accept toggle), Auto Queue (+ max concurrent agents), and Git Integration (auto-branch + base branch). Skippable ("Skip — I'll create a project later").
5. **Preferences** — default model (Sonnet/Opus/Haiku) and desktop notification toggle.
6. **Ready** — configuration summary, then `finish(...)`.

`finish` (`setup.rs`) persists `config.json`, runs the Electron-era data migration if applicable, initializes the SQLite DB, saves language to `app_settings`, optionally creates the first project, starts the MCP HTTP server on the chosen port, opens the main window, and closes the setup window.

## Single instance

`tauri_plugin_single_instance` — a second launch focuses the existing main window instead of opening a new process; it does not open a second window.

## System tray

A tray icon (Show / Quit) is always created. Whether closing the main window hides it to the tray vs. quitting the app is governed by the `minimize_to_tray` app setting — **default is off**, so by default closing the window behaves like a normal app quit; only when the user enables it does the tray-hide behavior kick in.

## Changing settings after setup

Data directory and MCP port live in `config.json` and are edited from the in-app settings screen; most other preferences (default model, notifications, `minimize_to_tray`, `launch_at_startup`, etc.) live in the `app_settings` DB table and apply without a restart. Changing the data directory does not migrate existing data.

## Key code

- `client/public/setup.html` — wizard UI/logic (vanilla JS, not React)
- `src-tauri/src/setup.rs` — `check_system`, `check_directory`, `get_default_dir`, `browse_folder`, `finish`, `quit`
- `src-tauri/src/lib.rs` — setup vs. main window branch, single-instance plugin, tray, minimize-to-tray close interceptor
- `src-tauri/src/db/settings.rs` — `AppSettings` defaults (`minimize_to_tray: false`, `default_model: "sonnet"`, ...)
