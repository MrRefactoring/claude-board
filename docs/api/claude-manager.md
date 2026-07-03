# Claude Manager API

Tauri IPC only — wraps the local `claude` CLI to manage MCP servers, plugins, marketplaces, settings, sessions, and codebase scans. All commands require the Claude CLI on `PATH`.

## Commands

### CLI / auth / agents
- `get_auth_info()` — parses `claude auth status` JSON.
- `get_claude_version()` — `claude --version`.
- `update_claude_cli()` — `claude update`.
- `list_agents()` — parses `claude agents` output into `{ name, model, type }`.
- `list_sessions()` — scans `~/.claude/projects/**/*.jsonl`, returns the 50 most recently modified sessions.
- `get_permission_rules()` — parses `claude auto-mode config` JSON.

### Settings & hooks
- `get_claude_settings()` / `save_claude_settings(settings)` — read/write `~/.claude/settings.json`.
- `get_hooks()` / `save_hooks(hooks)` — read/write the `hooks` key inside that same file.

### MCP servers
- `list_mcp_servers()` — parses `claude mcp list`.
- `add_mcp_server(name, commandStr, args?, scope?, env?)` — `claude mcp add --scope <local|...> [-e K=V ...] <name> -- <commandStr> [args...]`.
- `remove_mcp_server(name, scope?)`.

### Plugins & marketplaces
- `list_plugins()`, `install_plugin(name)`, `uninstall_plugin(name)`, `toggle_plugin(name, enabled)`.
- `list_marketplaces()`, `add_marketplace(source, scope?)`, `remove_marketplace(name)`.

### Codebase scan (CLAUDE.md generation)
- `prescan_stats(projectId)` — walks the project dir (skips `node_modules`, `.git`, etc.) and returns `{ fileCount, projectTypes, estimatedTime }` without invoking Claude.
- `scan_codebase(projectId, scanType?, customPrompt?)` — runs `claude -p <prompt> --output-format text --max-turns <N> --dangerously-skip-permissions` in the project dir. `scanType` is one of `quick | api | architecture | custom | detailed` (default `detailed`; `custom` uses `customPrompt`). Emits `scan:started` → `scan:stats` → `scan:progress` → `scan:completed`. Result is also inserted into the `scans` table.
- `save_scan_result(projectId, content, scanType?, mode?)` — writes/appends `content` to the project's `CLAUDE.md` (`mode`: `overwrite` (default) or `append`).
- `get_scan_history(projectId)`, `get_scan_detail(id)`, `delete_scan(id)` — CRUD over the saved `scans` table.

### Custom commands & skills
- `list_custom_commands()` — lists `.md` files under `~/.claude/commands`.
- `list_custom_skills()`, `save_custom_skill(name, content)`, `delete_custom_skill(name)` — `~/.claude/skills/<name>.md`.
- `fetch_github_skills(repoUrl, path?)` — tries `skills_index.json` first, then falls back to browsing the repo via the GitHub contents API (skill-folder or flat-`.md` heuristics).
- `fetch_skill_content(url)` — downloads a raw skill file.

### Suggestions
- `get_suggestions()` — heuristic checks (claude-mem plugin installed?, any MCP server connected?, git `user.name` configured?) returned as actionable suggestion cards.

## Notes
- `scan_codebase` takes `scanType` / `customPrompt`, **not** `mode` — `mode` (`overwrite`/`append`) belongs to `save_scan_result`. These are separate calls in the real flow: scan first, then the user decides how to save it.
- No HTTP/`/api` route exists for any of this — it is desktop-only by design (requires local CLI + filesystem access).

## Key code
- `src-tauri/src/commands/claude_manager.rs` — all commands above
