# Custom Commands & Skills

Viewers for the markdown files that define Claude's custom slash commands and skills, plus a GitHub-based importer for skills.

## Behavior

Both are opened from the project header menu (Commands / Skills items) as modals.

### Commands viewer

- Lists every `*.md` file in `~/.claude/commands/` (`list_custom_commands` command), split-pane: file list on the left, full raw content preview (`<pre>`) on the right.
- Read-only — no create, edit, or delete from the app. To add a command, add a `.md` file directly to `~/.claude/commands/`; its filename becomes the slash command name.
- The backend also scans a project-scoped commands dir path, but in practice only `~/.claude/commands` is ever passed in, so every entry currently reports `scope: "user"` — there is no working project-level commands directory today.

### Skills viewer

- Lists every `*.md` file in `~/.claude/skills/` (`list_custom_skills`), split-pane: file list (with delete button) on the left, rendered markdown preview on the right.
- Delete removes the file (`delete_custom_skill`).
- Has an additional **Import** view (GitHub icon) not present for commands:
  1. Pick one of three curated repos, or enter a GitHub `user/repo` (or a `.../tree/<branch>/<path>` URL).
  2. Backend (`fetch_github_skills`) first tries `skills_index.json` at the repo root for a fast catalog; falls back to browsing the GitHub Contents API, auto-detecting whether the repo uses one-skill-per-subfolder (`SKILL.md` inside each dir) or flat `*.md` files.
  3. Results support search/category filtering (index-sourced repos only) and per-skill preview (fetches raw content on demand).
  4. Install (`save_custom_skill`) writes the fetched content to `~/.claude/skills/<name>.md`; already-installed skills are marked and disabled from re-install.

## Edge cases

- Empty `~/.claude/commands/` or `~/.claude/skills/` directories (or a missing directory) render an empty state, not an error.
- GitHub import falls back through: `skills_index.json` → `skills/` subdir via Contents API → repo root via Contents API; if none yield results, it errors with "No skills found."

## Key code

- `src-tauri/src/commands/claude_manager.rs` — `list_custom_commands`, `list_custom_skills`, `save_custom_skill`, `delete_custom_skill`, `fetch_github_skills`, `fetch_skill_content`.
- `client/src/features/commands/CommandsModal.tsx` — commands split-pane viewer.
- `client/src/features/skills/SkillsModal.tsx` — skills browse/import views, GitHub import flow.
- `client/src/features/projects/Header.tsx` — project menu entries that open these modals.
