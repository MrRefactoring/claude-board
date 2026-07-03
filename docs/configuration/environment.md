# Environment & App Config

How Claude Board resolves its own runtime config, and how it makes the `claude` CLI subprocess environment work correctly from a GUI-launched app.

> **Note:** There are no `CLAUDE_BOARD_DATA` / `PORT` OS environment variable overrides in the codebase — `config.rs::load`/`load_from_handle` read only `config.json`, nothing from `std::env`. If you need to change the data dir or port, edit `config.json` or use the setup wizard / settings screen.

## App config file

- Path: Tauri's `app_data_dir()` (keyed by the bundle identifier `com.claudeboard.desktop`) joined with `config.json`.
- Shape (`AppConfig` in `src-tauri/src/config.rs`): `{ dataDir: string, port: number, language: string }`.
- Defaults: `port = 4000`, `language = "en"`, `dataDir = ""` (must be set on first run via the setup wizard).
- If the file is corrupt JSON, it's renamed to `config.json.bak` and defaults are used instead of crashing.
- The data directory itself holds `claude-board.db` (SQLite) and `uploads/` — separate from `config.json`'s own location.

## PATH resolution for subprocess spawning

GUI-launched apps (opened from Finder/Dock, not a terminal) inherit a minimal `PATH` from the OS that excludes shell-rc additions (`~/.local/bin`, nvm/pyenv shims, Homebrew on Apple Silicon, cargo, etc.) — so a bare `Command::new("claude")` can fail with ENOENT even though `claude` works fine in a terminal.

`src-tauri/src/claude/env_path.rs` works around this: on macOS/Linux it runs the user's login shell (`$SHELL -lic 'printf %s "$PATH"'`) once per process launch, caches the result, and prepends it to the current `PATH` for every subprocess Claude Board spawns (primarily `claude`, also `git`/`gh`). On Windows this is a no-op — GUI apps already inherit the full user `PATH`.

## Per-task subprocess environment

Each spawned `claude` process gets an MCP server config (`--mcp-config`) with these env vars for the bundled `mcp-server.js` sidecar:

| Variable | Value |
|----------|-------|
| `CLAUDE_BOARD_URL` | `http://localhost:<mcp port>` — where the sidecar reaches the Rust backend's HTTP API |
| `CLAUDE_BOARD_TASK_ID` | The task's numeric id, so permission requests and MCP tool calls are attributed to the right task |

## Key code

- `src-tauri/src/config.rs` — `AppConfig`, load/save
- `src-tauri/src/claude/env_path.rs` — login-shell PATH resolution
- `src-tauri/src/claude/runner.rs::build_claude_args` — `--mcp-config` env injection
- `src-tauri/resources/mcp-server.js` — reads `CLAUDE_BOARD_URL` / `CLAUDE_BOARD_TASK_ID`
