# Auth API

Optional API-key gate for the MCP HTTP bridge — currently generated but not enforced.

## Endpoints / commands
- `GET /api/auth/status` — returns `{ "enabled": bool }` from `db::auth::is_auth_enabled`.
- Tauri command `get_auth_status()` — same check, returned as `{ enabled }`.
- Tauri command `enable_auth()` — generates a random API key, stores its SHA-256 hash, returns `{ enabled: true, api_key, message }`. The raw key is shown once and not recoverable.
- Tauri command `disable_auth()` — clears the enabled flag, returns `{ enabled: false }`.

## Notes
- `db::auth::validate_key` (the function that would check a bearer token against the stored hash) exists but is **never called anywhere in the codebase** — no middleware on the Axum router in `http_api.rs` enforces it. Toggling auth on/off currently only flips a DB flag and reports it via `/api/auth/status`; it does not gate any request.
- None of `get_auth_status` / `enable_auth` / `disable_auth` are invoked from `client/src` — this surface is registered in `src-tauri/src/lib.rs` but unused by the current UI.
- Do not confuse this with `get_auth_info` (`src-tauri/src/commands/claude_manager.rs`), which reports the Claude CLI's own login status via `claude auth status` — that one *is* used by the client (`api.getAuthInfo`).

## Key code
- `src-tauri/src/services/http_api.rs` — `GET /api/auth/status`
- `src-tauri/src/commands/auth.rs` — Tauri commands
- `src-tauri/src/db/auth.rs` — key generation/hashing/storage (`validate_key` unused)
