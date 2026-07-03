# Auto PR

Automatically opens a pull/merge request when a task enters review, and merges it when the task is accepted — across GitHub, GitLab, Azure DevOps, and Gitea/Forgejo.

## Behavior
1. Task completes (`in_progress` → `testing`): the branch is pushed and a PR/MR is opened. Idempotent — skipped if the task already has a `pr_url`.
2. Title: `{task_type}: {task_title}`. Body: task description, task key, type, and model used.
3. Task reaches `done` (manual approval, auto-test pass with no approval gate, or auto-approve without auto-test): the open PR/MR is merged. If no PR exists yet (task skipped Testing), one is opened first as a fallback.
4. A failed merge never blocks the `done` transition — the PR is left open and the error is logged on the task and surfaced in the UI.
5. Provider is resolved per project: explicit `pr_provider` setting, or auto-detected from `git remote get-url origin` (`github.com`, `gitlab.*`, `dev.azure.com`/`visualstudio.com`, `codeberg.org`/`gitea.*`).

## Settings
- `auto_pr` — project-level toggle; overridable per task (`tasks.auto_pr`, `NULL` = inherit project default).
- `pr_provider` — `auto` (default, URL-detected) | `github` | `gitlab` | `azure_devops` | `gitea` | `none`.
- `pr_base_branch` — PR base/target branch (default `main`).
- `auto_merge` — only takes effect when `auto_pr` is off: attempts a local `git merge --no-ff` of the task branch into the base branch on completion. Skipped (branch kept) unless the base branch is the clean, checked-out HEAD of the working dir; on conflict it `merge --abort`s and keeps the branch.

## Edge cases
- `auto_pr` off and `auto_merge` off → branch is always kept (never force-deleted; it lives in a persistent worktree so git would refuse anyway).
- `auto_pr` on → the branch is never touched by cleanup; the open/merged PR owns it.
- Provider CLI missing or not authenticated → PR create/merge is skipped with an info/error log entry naming the CLI (`gh`/`glab`/`az`/`tea`) and install/login hint.
- Provider `Unknown` (auto-detect failed, no override set) → skipped with a note to set `pr_provider` explicitly.

## Key code
- `src-tauri/src/services/pr_providers.rs` — provider detection (`detect_remote_provider`, `detect_from_url`) and PR create/merge (`create_pr`, `merge_pr`) across GitHub/GitLab/Azure DevOps/Gitea CLIs.
- `src-tauri/src/claude/runner.rs` — `auto_create_pr`/`auto_create_pr_public` (open on Testing entry), `merge_task_pr` (merge on Done), `cleanup_task_branch` (branch retention/local-merge logic).
- `src-tauri/src/commands/tasks.rs` — `execute_done_side_effects` (PR fallback + merge + branch cleanup on manual Done transition).
- `client/src/features/projects/AutomationSection.tsx` — Automation tab, "Git Workflow" section (Auto Branch/Merge/Push/PR toggles, PR Provider select).
