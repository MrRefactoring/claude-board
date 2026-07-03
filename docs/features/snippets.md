# Context Snippets

Reusable text blocks scoped to a project that get folded into every task prompt — used to enforce coding standards, architecture rules, or project conventions without repeating them per task.

## Behavior
- Managed per-project (title + content) via project settings.
- When a task's prompt is built, all snippets with `enabled = 1` for the project are loaded (ordered by `sort_order`, then `id`) and appended to the prompt under a `## Project Context` section, one `### <title>` block per snippet.
- Disabled snippets are retained but excluded from the prompt — this lets you keep a library and toggle only what's relevant per task run.

## Edge cases
- No enabled snippets for the project → the `## Project Context` section is omitted entirely.

> **Note:** Snippets are distinct from a repo's `CLAUDE.md` — snippets are managed in-app and injected by the backend into the prompt; `CLAUDE.md` is a file Claude reads directly from the working directory.

## Key code
- `src-tauri/src/db/snippets.rs` — `context_snippets` table access, `get_enabled_by_project`
- `src-tauri/src/claude/prompt.rs` — folds enabled snippets into the built prompt
- `src-tauri/src/commands/snippets.rs` — CRUD commands
- `client/src/features/snippets/SnippetsModal.tsx` — management UI
