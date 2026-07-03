# Permissions

Per-project setting controlling which tools an agent can use without a human in the loop. Values: `permission_mode` = `"auto-accept"` | `"allow-tools"` | `"default"`.

## Behavior

Applied when building the `claude` CLI args (`runner.rs::build_claude_args`):

### Auto Accept (`auto-accept`)
Passes `--dangerously-skip-permissions`. Full tool access, no prompts. Default for new projects.

### Allowed Tools (`allow-tools`)
Passes `--allowedTools <tool>` once per entry in `allowed_tools` (comma-separated, e.g. `Bash, Read, Write, Edit, Glob, Grep`). If the list is empty, falls back to `--dangerously-skip-permissions` rather than blocking every tool.

### Default (`default`)
Since the CLI runs headless (`-p`, no TTY) it can't show an interactive permission prompt. Claude Board instead routes permission requests through an MCP tool: any explicitly `allowed_tools` are pre-approved, and `--permission-prompt-tool mcp__claude-board__approve_permission` is registered for everything else. When Claude wants an unapproved tool, it calls that MCP tool, which creates a pending request (`services/permissions.rs`) shown to the user as an approval card (Yes / Yes-always / Deny) in the UI. The task is not blocked forever — the sidecar polls with a timeout (~5 min) and pending requests are cleaned up after ~10 min.

> **Note:** This is not "may cause agents to stall" — it's a live approval workflow. It does mean the task pauses until someone responds to the card (or it times out).

## Tool names

Actual tool identifiers used by the `allow-tools` UI (`PermissionsSection.tsx` hint text): `Bash, Read, Write, Edit, Glob, Grep, Agent, WebSearch, WebFetch, NotebookEdit`. These are the Claude Code CLI's own tool names, not a Claude-Board-defined category list.

## "Always allow" scope

"Remember" on an approval card adds the tool to an in-memory, session-only allow-set (`PermState.remembered`) — nothing is persisted to disk or the DB. It resets on app restart. This applies to both the task runner and the separate AI chat feature (which has its own `chat_bypass_permissions` app setting).

## Key code

- `src-tauri/src/claude/runner.rs::build_claude_args` — mode → CLI flags
- `src-tauri/src/services/permissions.rs` — pending-request registry, resolve/remember logic, cleanup
- `src-tauri/src/commands/permissions.rs` — `get_pending_permissions` / `resolve_permission` (desktop); `services::http_api` exposes the same for the MCP sidecar and web mode
- `client/src/features/projects/PermissionsSection.tsx` — mode picker UI
