# Claude Manager

Control panel for the Claude CLI environment: MCP servers, plugins, agents, session history, permission rules, hooks, raw settings, and account/CLI version — all backed by shelling out to the `claude` CLI or reading its config files directly (no separate persistence layer).

## Behavior

Tabbed view with 8 tabs: MCP, Plugins, Agents, Sessions, Permissions, Hooks, Account, Settings.

- **MCP** — lists servers via `claude mcp list` (parsed from CLI text output). Add opens a form (name, scope: local/project/user, command, env vars) that runs `claude mcp add`; remove runs `claude mcp remove`. Connection status (`connected`) is whatever the CLI output reports at list time — there is no live ping from the app.
- **Plugins** — lists installed plugins via `claude plugin list`; install/uninstall/enable/disable map directly to `claude plugin install|uninstall|enable|disable`. A separate marketplaces sub-section lists/adds/removes marketplaces via `claude plugin marketplace list|add|remove`. There is no browsing, filtering, or sorting UI — just a name/source input and a flat list.
- **Agents** — lists agents via `claude agents`, split into "user" and "builtin" sections by name/model. This reflects configured agent definitions, not live/idle process state — there's no running-task or duration/outcome data.
- **Sessions** — reads `~/.claude/projects/**/*.jsonl` directly (not via the CLI), grouped by project directory, sorted by file mtime descending, capped at 50 entries. Each entry shows session id, file size, and relative modified time. There's no per-session model/turns/tokens/cost breakdown — those fields don't exist in this view.
- **Permissions** — read-only. Fetches `claude auto-mode config` and renders three buckets: allow / soft_deny / block. Each rule is a raw string (`"title: description"`), not a structured tool/pattern/action row. No add/edit/remove UI.
- **Hooks** — reads/writes the `hooks` key of `~/.claude/settings.json` via `claude_manager::get_hooks`/`save_hooks`. Shows a read-only summary per event (event name + command count + truncated command previews) plus a raw JSON textarea for editing. It is a JSON editor, not a hook-script editor.
- **Account** — shows auth info from `claude auth status` (email, plan, org, auth method, logged-in state) and the CLI version from `claude --version`. "Check for Updates" runs `claude update` and refreshes the version. There is no sidebar update badge — the check is manual, on demand.
- **Settings** — a raw JSON textarea over the full contents of `~/.claude/settings.json` (get/save round-trip). There is no form UI with discrete fields like default model, max tokens, theme, or telemetry — it's whatever keys already exist in the file.

Also backs codebase scanning (`scan_codebase`), custom command/skill listing, and suggestion generation (e.g., "install claude-mem", "add an MCP server", "configure git identity") — these are adjacent features reachable through the same command module but not part of the manager's tabs.

> **Note:** CLI updates and app updates are unrelated — `update_claude_cli` only affects the `claude` binary, not the desktop app.

## Settings

- `~/.claude/settings.json` — full file is the editable "Settings" tab payload; `hooks` key specifically is the "Hooks" tab payload.

## Edge cases

- MCP/plugin/marketplace list parsing is regex/string-based over CLI stdout — an unexpected CLI output format degrades gracefully to partial or empty parsed fields, not an error.
- `save_hooks` requires the existing settings blob to deserialize as a JSON object; otherwise it errors before writing.
- Session listing reads at most 50 most-recently-modified `.jsonl` files across all project dirs; older sessions are not shown.

## Key code

- `src-tauri/src/commands/claude_manager.rs` — all MCP/plugin/agent/session/permission/hook/settings/account commands; CLI output parsing (`parse_mcp_list`, `parse_plugin_list`, `parse_agents`, `parse_marketplace_list`).
- `client/src/features/claude-manager/ClaudeManager.tsx` — tab shell.
- `client/src/features/claude-manager/McpTab.tsx`, `PluginsTab.tsx`, `AgentsTab.tsx`, `SessionsTab.tsx`, `PermissionsTab.tsx`, `HooksTab.tsx`, `AuthTab.tsx`, `SettingsTab.tsx` — per-tab views.
- `client/src/features/claude-manager/types.ts` — local response shapes (`McpServer`, `PluginInfo`, `Agent`, `Session`, `PermissionRules`, `HooksConfig`, `AuthInfo`).
