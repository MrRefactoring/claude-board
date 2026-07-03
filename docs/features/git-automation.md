# Git Automation

Automatic git worktree/branch creation, PR creation, and merge handling for tasks, so agents work in isolation and reviewable branches without manual git steps.

The full worktree→branch→push→PR→merge→removal lifecycle, its persisted state, and the transparency touchpoints are specified in `../concepts/work-lifecycle.md` — this page covers the automation settings that drive it.

## Behavior

1. **Branch/worktree creation** — when a task run starts (transition to In Progress), and `auto_branch` is on, the runner creates an isolated git worktree at `.worktrees/<slug>-<id>` off `pr_base_branch` and checks out a branch named `<task_type>/<slug>` (slug = task title lowercased, Turkish-char-folded, **Cyrillic transliterated to Latin** (e.g. «Обновить документацию» → `obnovit-dokumentatsiyu`), then reduced to **ASCII** alphanumerics with non-alphanumeric replaced by `-`, truncated to 40 chars — so branch names are always English/ASCII; a title with no transliterable characters falls back to `task-<id>`; `task_type` defaults to `feature`). The worktree path is persisted on the task (`worktree_path`) so it's discoverable in the UI and survives an app restart. If not in a git repo, or `auto_branch` is off, the agent just runs in the project's working directory on the current branch.
   - Revisions of the same task reuse the existing worktree, recreating it from the branch if it was already removed.
   - A pre-existing worktree/branch dir is removed and recreated fresh at run start.
2. **PR creation** — when a task enters **Testing**, if `auto_pr` (effective: per-task override else project default) is on, the branch is pushed (outcome logged, `pushed=1` set) and a PR is opened via the detected PR provider CLI (title = task title, body = task description, base = `pr_base_branch`, head = task branch). Skipped if a PR already exists. Also re-attempted as a fallback on the Done transition if it didn't happen at Testing. The push+create body (`do_create_pr`) is shared with the manual "Create PR" action.
3. **PR merge** — when a task reaches **Done** (approval), if an open PR exists it is merged via the provider CLI. Merge failure never blocks Done — the PR is left open and the error is logged to the task.
4. **Branch cleanup + worktree removal** — after Done, the branch is **never** force-deleted (avoids orphaning commits). If `auto_merge` is on, the branch is merged into the base with `git merge --no-ff` — but only if the base branch is the clean, checked-out HEAD of the main working dir; otherwise (or on conflict) the merge is skipped/aborted and the branch is kept. The **worktree** is then removed **iff the work is safe on the remote** (`pr_url` set or `pushed=1`); otherwise it is kept as the only copy, with its path still visible. See `../concepts/work-lifecycle.md`.
5. **Manual Testing actions** — a task in Testing exposes **Push branch** and **Create PR** buttons (Tauri-only) that work even when `auto_pr` is off, so `auto_pr=0` work can still be pushed/PR'd on demand.

## Settings

Project-level (`projects` table / Project Settings > Automation):
- `auto_branch` — create an isolated worktree+branch per task run. **Default: on** (doc previously said off — code default is `1`).
- `auto_pr` — open a PR when a task enters Testing. Default: off.
- `auto_push` — (exposed in UI; no standalone automatic push — pushing happens as part of `auto_pr`, or on demand via the manual "Push branch" button).
- `auto_merge` — merge the task branch into base on Done. Default: off.
- `pr_base_branch` — base branch for worktrees and PRs. Default: `main`.
- `pr_provider` — `auto` (detect from git remote), or an explicit provider (`github`, `gitlab`, `azure_devops`, `gitea`), or `none`.

Task-level:
- `auto_pr` (nullable) — per-task override of the project's `auto_pr`; `NULL` inherits the project setting.

## Edge cases

- PR provider is auto-detected from the project's `pr_provider` setting or the git remote URL — supports GitHub (`gh`), GitLab (`glab`), Azure DevOps (`az`), and Gitea/Forgejo (`tea`), not just `gh`.
- Branch name prefix comes from the task's `task_type` field (e.g. `bugfix/`, `refactor/`), not parsed from the title text as the old doc implied.
- `auto_merge` only fires if the working tree is clean and checked out on the base branch; a dirty tree or wrong HEAD skips the merge (branch kept for manual merge), logged to the task.

## Key code

- `src-tauri/src/claude/runner.rs` — `ensure_task_worktree` (branch/worktree creation + `worktree_path` persist), `get_task_worktree` (DB-backed, restart-safe), `push_task_branch` (push + log outcome + `pushed`), `do_create_pr`/`auto_create_pr`/`auto_create_pr_public` (PR open), `manual_push_branch`/`manual_create_pr` (Testing actions), `merge_task_pr` (PR merge on Done), `cleanup_task_branch` (post-Done branch handling), `remove_task_worktree_if_safe` (Done-time worktree removal), `effective_auto_pr`/`effective_auto_merge`.
- `src-tauri/src/commands/tasks.rs` — status-transition wiring: PR open on `Testing`, PR merge + branch cleanup + worktree removal on `Done` (`execute_done_side_effects`); manual `push_task_branch` / `create_task_pr` commands.
- `src-tauri/src/services/pr_providers.rs` — multi-provider PR create/merge (`gh`/`glab`/`az`/`tea`), provider auto-detection.
- `src-tauri/src/db/schema.rs` — `auto_branch`, `auto_pr`, `auto_push`, `auto_merge`, `pr_base_branch` project columns; `worktree_path`, `pushed` task columns.
- `client/src/features/projects/AutomationSection.tsx` — project settings UI for these toggles; `client/src/features/tasks/TaskGitTab.tsx` — Work location panel + Testing actions.
