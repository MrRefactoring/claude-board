# CLAUDE.md Editor

In-app editor for the project's `CLAUDE.md` — the file the `claude` CLI reads automatically from its working directory at the start of a run. Claude Board does not inject its contents into the prompt itself; the CLI process picks it up from disk because it's launched with `cwd` set to the task's working directory (or worktree).

## Behavior

- Opened from a header button (`Header.tsx`) or the command palette ("Edit CLAUDE.md"), not nested in project settings.
- `get_claude_md(project_id)` reads `<project.working_dir>/CLAUDE.md`; if missing, the editor pre-fills a default template and shows a "New file" badge instead of erroring.
- `save_claude_md(project_id, content)` writes the file directly to `<project.working_dir>/CLAUDE.md`, overwriting it.
- Markdown editor (`MDEditor`) with live preview; `Ctrl/Cmd+S` saves.

## Edge cases

- Writing fails (surfaced as an error in the UI) if the working directory doesn't exist or isn't writable.
- No versioning/diffing in the editor — it's a direct overwrite. Git history (if the file is tracked) is the only undo mechanism.

## Key code

- `client/src/features/editor/ClaudeMdEditor.tsx` — editor UI
- `src-tauri/src/commands/stats.rs::get_claude_md` / `save_claude_md` — read/write `CLAUDE.md` at the project root
- `client/src/lib/api.ts` — `getClaudeMd` / `saveClaudeMd` (`GET`/`PUT` `/api/projects/:id/claude-md` in web mode)
