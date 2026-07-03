# Stats API

Per-project stats/activity, global Claude usage, and CLAUDE.md read/write.

## Endpoints / commands
- `GET /api/projects/{pid}/stats` — aggregate status/type/priority counts etc. (`stats::get_project_stats`).
- `GET /api/stats/claude-usage` — global (all projects) usage: `{ usage, models, timeline, limits }` from `stats::get_global_usage` / `get_global_model_breakdown` / `get_usage_timeline` / `get_claude_limits`.
- `GET /api/projects/{pid}/activity?limit=&offset=` — recent activity feed (`activity::get_by_project`), `limit` default 50, `offset` default 0.
- Tauri command `get_project_stats(projectId)` — same as the HTTP route, but 404s (`Err("Project not found")`) if the project doesn't exist; the HTTP handler doesn't check.
- Tauri command `get_claude_usage()` / `get_activity(projectId, limit?, offset?)` — IPC equivalents of the two routes above.
- Tauri command `get_claude_md(projectId)` — reads `<workingDir>/CLAUDE.md`, returns `{ exists, content }`.
- Tauri command `save_claude_md(projectId, content)` — overwrites `<workingDir>/CLAUDE.md`.

## Notes
- CLAUDE.md read/write is Tauri-only (filesystem access) — no HTTP equivalent, despite `client/src/lib/api.ts` defining `/api/projects/:id/claude-md` fallback paths.
- Cost figures are computed from published Claude API pricing tables, not billed amounts.

## Key code
- `src-tauri/src/services/http_api.rs` — stats/activity/usage routes
- `src-tauri/src/commands/stats.rs` — Tauri equivalents + CLAUDE.md
- `src-tauri/src/db/stats.rs` — aggregation queries
