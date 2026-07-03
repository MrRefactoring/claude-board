# Claude Board — Internal Documentation

How the app is meant to behave — concise behavioral specs, not user docs.
The code must match these specs; a change that leaves its spec stale is a bug
(see `CLAUDE.md` → Documentation).

## Concepts — core model

- [Agents](concepts/agents.md) — An "agent" is a headless Claude Code CLI process Claude Board spawns per task. It runs on the local machine, reads/writes the project's working directory, and streams output back over realtime events.
- [Board & Views](concepts/board.md) — The main project screen offers several ways to look at the same task set. All views update live from realtime events — no polling.
- [Review System](concepts/review.md) — Human-in-the-loop gate between an agent finishing work and a task being accepted. Lets you approve or send work back with feedback.
- [Tasks](concepts/tasks.md) — The core unit of work: a job for a Claude agent, tracked through a status lifecycle with usage/cost accounting.
- [Task Work Lifecycle](concepts/work-lifecycle.md) — How work travels from a task to the remote: worktree → branch → commits → push → PR → merge → worktree removal, and how every step stays visible.

## Features

- [Agent Names](features/agent-names.md) — Random per-task identity so concurrently running agents are distinguishable in the UI and logs.
- [Analytics](features/analytics.md) — Per-project cost, token, and performance dashboard, computed client-side from task usage fields plus the `get_project_stats` aggregate.
- [Approval Gates](features/approval-gates.md) — Optional manual review step between a task passing verification and being marked done.
- [File Attachments](features/attachments.md) — Files uploaded to a task that get copied into the agent's working directory as reference context.
- [Auto PR](features/auto-pr.md) — Automatically opens a pull/merge request when a task enters review, and merges it when the task is accepted — across GitHub, GitLab, Azure DevOps, and Gitea/Forgejo.
- [Auto Test](features/auto-test.md) — Runs an automated QA verification agent on a task before it reaches Done.
- [Battle View](features/battle-view.md) — An alternate visualization of the orchestration board: running/completed/failed tasks are rendered as agents fighting in an arena, driven by the same realtime task events as the rest of the board.
- [Circuit Breaker](features/circuit-breaker.md) — Pauses a project's task queue after too many consecutive permanent task failures, so a systemic problem doesn't burn through retries and cost unattended.
- [Claude Manager](features/claude-manager.md) — Control panel for the Claude CLI environment: MCP servers, plugins, agents, session history, permission rules, hooks, raw settings, and account/CLI version — all backed by shelling out to the `claude` CLI or reading its config files directly (no separate persistence layer).
- [Command Palette](features/command-palette.md) — Fuzzy-search launcher for tasks, projects, and app actions, bound to `Ctrl+K`/`Cmd+K`.
- [Custom Commands & Skills](features/custom-commands.md) — Viewers for the markdown files that define Claude's custom slash commands and skills, plus a GitHub-based importer for skills.
- [Task Dependencies](features/dependencies.md) — DAG-based ordering between tasks: a task only becomes eligible to run once its dependencies are satisfied. Supports conditional edges (success/failure branching), cycle prevention, and sub-task spawning with parent rollup.
- [Diff Viewer](features/diff-viewer.md) — Shows the git diff produced by a task's commits, inline in the Task Detail modal's Git tab.
- [Failed Status](features/failed-status.md) — Terminal task status (`failed`) for tasks that exhausted retries or were manually marked as failed. Recoverable by moving back to `backlog`/`in_progress`, which resets the retry counter.
- [Git Automation](features/git-automation.md) — Automatic git worktree/branch creation, PR creation, and merge handling for tasks, so agents work in isolation and reviewable branches without manual git steps.
- [GitHub Issues Sync](features/github-issues.md) — Browse a project's open GitHub issues from the board and selectively import them as tasks (one-directional: import + auto-close-on-approve; no live two-way sync).
- [Model Filter](features/model-filter.md) — Toolbar chips that filter the current project's tasks down to one Claude model family, applied client-side across the views that consume the filtered task list.
- [Desktop Notifications](features/notifications.md) — Native OS notifications (macOS/Windows, via `tauri-plugin-notification`) fired on task lifecycle events, so a user doesn't have to keep the board in view while agents run.
- [Orchestration View](features/orchestration.md) — Mission control for multi-agent parallel execution: visualizes the task DAG, execution timeline, and live agent activity, kept fresh via realtime events instead of polling.
- [Planning Mode](features/planning-mode.md) — AI-assisted task breakdown: Claude explores the codebase and proposes a structured set of tasks (with dependency edges) that the user reviews and approves onto the board.
- [Project Terminal](features/project-terminal.md) — Aggregates `task:log` output from every task in a project into one live-scrolling view, so a swarm of parallel agents can be watched without opening a terminal per task.
- [Prompt Templates](features/prompt-templates.md) — Reusable, per-task-type instruction blocks injected into Claude's prompt. Used to enforce coding standards, framework conventions, and quality guidelines without repeating them per task.
- [Pipeline & Auto-Queue](features/queue.md) — DAG-aware task auto-queue with crash recovery and periodic polling. Enable per project; the queue starts ready backlog tasks up to a concurrency limit and reacts to completions/failures without manual intervention.
- [Retry & Backoff](features/retry-backoff.md) — Automatic retry of failed tasks with exponential backoff and jitter, so transient failures and rate limits get a delay before the queue retries them.
- [Roadmap](features/roadmap.md) — Project-level view of milestones and phases. Two independent systems share the tab: a file-based bridge into the GSD (`.planning/`) spec-driven workflow, and a classic DB-backed Milestones/Phases tracker that works without GSD.
- [Roles](features/roles.md) — Reusable agent personas — a name plus a system prompt (and optionally a pinned model / tool allowlist) that can be assigned to a task so Claude's instructions are specialized for that task.
- [Codebase Scan](features/scan.md) — Runs Claude non-interactively over the project to produce a text analysis (tech stack, structure, patterns, etc.), previewed in a modal before being saved into the project's `CLAUDE.md` as context for future tasks.
- [Session Replay](features/session-replay.md) — Timeline-based playback of every event recorded during a task's execution — tool calls, results, usage, and system messages — for debugging and post-hoc review.
- [App Settings](features/settings.md) — Centralized configuration panel for startup behavior, defaults, and desktop preferences. Opened from the gear icon on the Dashboard or the project dropdown's App Settings entry.
- [Skill Import](features/skill-import.md) — Browse, preview, and install Claude Code skills (markdown instruction files) from GitHub repositories, without leaving the app.
- [Context Snippets](features/snippets.md) — Reusable text blocks scoped to a project that get folded into every task prompt — used to enforce coding standards, architecture rules, or project conventions without repeating them per task.
- [Split Terminal](features/split-terminal.md) — Side-by-side or stacked view of two live terminals, for watching multiple running agents at once.
- [Status Animations](features/status-animations.md) — Short CSS overlay animations played on a task card when its status changes, for visual feedback on drag-and-drop, button, or voice-driven transitions.
- [Task Keys](features/task-keys.md) — Auto-generated Jira-style identifier for every task, in the format `{TYPE}-{PROJECT}-{NUMBER}` (e.g. `FTR-CB-1001`).
- [Task Timeout](features/task-timeout.md) — Per-project limit on how long a task's agent process may run before it's automatically killed — guards against rate-limit stalls and infinite reasoning/editing loops.
- [Prompt Templates](features/templates.md) — Per-project, per-task-type reusable instruction blocks that get injected into a task's prompt automatically, so common boilerplate doesn't need to be retyped per task.
- [Live Terminal](features/terminal.md) — Real-time, filterable log stream of everything a Claude agent does during a task run.
- [Token Counter](features/token-counter.md) — Live estimated token count and input cost shown in the task creation form, to help gauge API cost before running a task.
- [Voice Assistant](features/voice-assistant.md) — Hands-free board control via speech: create tasks, check status, and move tasks through a conversational flow (voice or typed).
- [Webhooks](features/webhooks.md) — Per-project outbound notifications to Slack, Discord, Teams, or a custom HTTP endpoint when task events happen.
- [Workflow Templates](features/workflow-templates.md) — Reusable, dependency-wired task chains — define a sequence of steps once, then apply it to a project to create all the tasks with dependencies already set up.

## Configuration

- [CLAUDE.md Editor](configuration/claude-md.md) — In-app editor for the project's `CLAUDE.md` — the file the `claude` CLI reads automatically from its working directory at the start of a run. Claude Board does not inject its contents into the prompt itself; the CLI process picks it up from disk because it's launched with `cwd` set to the task's working directory (or worktree).
- [Environment & App Config](configuration/environment.md) — How Claude Board resolves its own runtime config, and how it makes the `claude` CLI subprocess environment work correctly from a GUI-launched app.
- [Permissions](configuration/permissions.md) — Per-project setting controlling which tools an agent can use without a human in the loop. Values: `permission_mode` = `"auto-accept"` | `"allow-tools"` | `"default"`.
- [Project Settings](configuration/projects.md) — A project is a codebase Claude agents work on, plus all the automation config that governs how tasks run against it. Backed by the `projects` table (`src-tauri/src/db/projects.rs`).

## API reference (Tauri IPC + /api HTTP bridge)

- [Attachments API](api/attachments.md) — File attachments on tasks — Tauri IPC only, no HTTP route exists for this surface.
- [Auth API](api/auth.md) — Optional API-key gate for the MCP HTTP bridge — currently generated but not enforced.
- [Claude Manager API](api/claude-manager.md) — Tauri IPC only — wraps the local `claude` CLI to manage MCP servers, plugins, marketplaces, settings, sessions, and codebase scans. All commands require the Claude CLI on `PATH`.
- [Realtime Events](api/events.md) — Typed event bus shared by the Tauri desktop shell (native events) and the web fallback (Socket.IO), keyed by name in `client/src/lib/events.ts` (`AppEventMap`).
- [GitHub API](api/github.md) — Issue import/sync and repo detection via the `gh` CLI — Tauri IPC only, no HTTP route. Requires `gh` installed and authenticated (`gh auth login`).
- [Planning API](api/planning.md) — AI-assisted task planning: Claude explores the codebase and proposes a task tree, which the user then approves into real tasks. Tauri IPC only.
- [Projects API](api/projects.md) — Project CRUD plus per-project automation/git/test/GitHub settings.
- [Roles API](api/roles.md) — Reusable agent configs (name + prompt + optional model/allowed-tools/color) assignable to tasks.
- [Settings API](api/settings.md) — Application-wide settings. Two surfaces exist with different field coverage: the HTTP bridge (used by the MCP sidecar / web fallback) and the fuller Tauri command (used by the desktop Settings UI).
- [Snippets API](api/snippets.md) — Reusable text blocks injected into an agent's prompt context. Tauri IPC only — no HTTP route exists.
- [Stats API](api/stats.md) — Per-project stats/activity, global Claude usage, and CLAUDE.md read/write.
- [Tasks API](api/tasks.md) — CRUD, status transitions (which drive the Claude agent lifecycle), dependencies, comments, and observability.
- [Templates API](api/templates.md) — Prompt templates for pre-filling new tasks. Tauri IPC only — no HTTP route exists.
- [Webhooks API](api/webhooks.md) — Outbound notifications (Slack/Discord/custom) fired on task lifecycle events. Tauri IPC only — no HTTP route exists.

## Desktop (build & setup)

- [Building from Source](desktop/builds.md) — Claude Board is a Tauri v2 app: React + Vite frontend (`client/`), Rust backend (`src-tauri/`). `bundle.targets` is `"all"` in `src-tauri/tauri.conf.json`, so `tauri build` produces every installer format supported by the host OS.
- [Desktop Setup](desktop/setup.md) — First-launch setup wizard (`client/public/setup.html`, a standalone HTML/JS view — not part of the main React app) shown when no `config.json` exists yet. Backed by Tauri commands in `src-tauri/src/setup.rs`.

