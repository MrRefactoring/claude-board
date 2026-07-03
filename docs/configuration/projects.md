# Project Settings

A project is a codebase Claude agents work on, plus all the automation config that governs how tasks run against it. Backed by the `projects` table (`src-tauri/src/db/projects.rs`).

## Core settings

| Field | Notes |
|-------|-------|
| `name` / `slug` | Slug is generated from name at creation |
| `working_dir` | Absolute path; must exist and be writable by the process running Claude Board |
| `icon` / `icon_seed` | Avatar |
| `project_key` | Short prefix used in generated task keys (e.g. `CB-101`) |

Changing `working_dir` doesn't affect a task already running — only the next agent spawn uses the new path.

## Permissions

`permission_mode` (`auto-accept` | `allow-tools` | `default`) + `allowed_tools` (comma-separated tool list). See `docs/configuration/permissions.md`.

## Auto-queue

- `auto_queue` — when on, the 15s queue poll starts ready backlog tasks automatically.
- `max_concurrent` (default `1`) — per-project concurrency cap; no app-wide cap exists.

## Git automation

| Setting | Default | Effect |
|---------|---------|--------|
| `auto_branch` | on | Creates a git worktree + feature branch per task |
| `auto_pr` | off | Opens a PR/MR when the task enters Testing (per-task override via `task.auto_pr`) |
| `auto_push` | off | Pushes commits to the branch as the agent works |
| `auto_merge` | off | Merges the branch into `pr_base_branch` on Approve (only when the base branch is clean HEAD; aborts and keeps the branch on conflict) |
| `pr_base_branch` | `main` | Base branch for worktrees, PRs, and merges |
| `pr_provider` | `auto` | GitHub / GitLab / Azure DevOps / Gitea, auto-detected from the git remote if unset |

## Auto-test & retries

| Setting | Default | Effect |
|---------|---------|--------|
| `auto_test` | off | Re-spawns the agent with `test_prompt` before leaving Testing |
| `test_prompt` | — | Custom instructions for the auto-test run |
| `auto_test_model` | `sonnet` | Model used for the auto-test pass |
| `max_retries` | `2` (engine default; `0` in schema means "use default") | Retries on process failure |
| `max_auto_revisions` | `3` | Cap on auto-driven revision loops |
| `retry_base_delay_secs` / `retry_max_delay_secs` | `30` / `600` | Exponential backoff with ±20% jitter |
| `circuit_breaker_threshold` / `circuit_breaker_active` / `consecutive_failures` | — | Trips auto-queue off after repeated failures |
| `task_timeout_minutes` | `0` (disabled) | Kills and retries a task's process past this wall-clock time |

## Approval gate

`require_approval` (default off) — when on, a task that finishes (with or without auto-test passing) waits in **Testing**/**Awaiting Approval** for a human instead of auto-completing. See `docs/concepts/review.md`.

## Other

- `github_repo` / `github_sync_enabled` — links the project to a GitHub repo for issue sync.
- `gsd_enabled` — enables the GSD planning/roadmap integration for this project.
- Webhooks, context snippets, and prompt templates are project-scoped but documented under `docs/features/`.

## Key code

- `src-tauri/src/db/projects.rs` — `Project` struct (full field list), CRUD
- `src-tauri/src/db/schema.rs` — column defaults / migrations
- `src-tauri/src/commands/projects.rs` — Tauri commands
- `client/src/features/projects/useProjectForm.ts`, `PermissionsSection.tsx`, `AutomationSection.tsx` — settings UI
