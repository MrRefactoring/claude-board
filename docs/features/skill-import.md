# Skill Import

Browse, preview, and install Claude Code skills (markdown instruction files) from GitHub repositories, without leaving the app.

## Behavior
- Opened from Project Menu > Skills. Default view lists skills already installed in `~/.claude/skills/`; selecting one previews its rendered markdown.
- Import view: pick a popular repo shortcut or enter any GitHub URL/slug (`user/repo`, full URL, or a `tree/branch/path` URL) and fetch its contents via the GitHub API.
- Results can include subdirectories (click to browse deeper, with a back button) and/or a flat skill list; a search box and category filter appear once a repo exposes more than 10 skills.
- Each skill can be previewed (lazy-loads its raw content) and installed individually; already-installed skills show a green "Installed" badge.
- Installing writes the skill's raw content to `~/.claude/skills/<name>.md`; the filename (without extension) is the skill name Claude reads.

## Edge cases
- Only public repositories are supported; there is no GitHub authentication, so private repos will fail to fetch.
- There is no bulk "Install All" action — skills must be installed one at a time.

## Key code
- `client/src/features/skills/SkillsModal.tsx` — browse/import UI, popular repo list (`POPULAR_REPOS`: `sickn33/antigravity-awesome-skills`, `ComposioHQ/awesome-claude-skills`, `affaan-m/everything-claude-code`)
- `src-tauri/src/commands/claude_manager.rs` — `list_custom_skills`, `save_custom_skill`, `delete_custom_skill`, `fetch_skill_content`, `fetch_github_skills` (reads/writes `~/.claude/skills/`, calls `api.github.com`)
