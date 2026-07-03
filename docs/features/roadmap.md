# Roadmap

Project-level view of milestones and phases. Two independent systems share the tab: a file-based bridge into the GSD (`.planning/`) spec-driven workflow, and a classic DB-backed Milestones/Phases tracker that works without GSD.

## Behavior

The Roadmap tab renders up to three sections:

1. **Project Overview** — shown only if `.planning/PROJECT.md` exists. Collapsible card: header = project name (H1 of `PROJECT.md`) + summary + `current_phase` badge from `STATE.md`; expanded view shows current phase/step plus the raw `PROJECT.md`/`STATE.md` contents.
2. **`.planning/` Roadmap** — shown only if `.planning/` exists. Parses `ROADMAP.md` phase-by-phase into structured fields (Goal, Depends on, Requirements, Success Criteria, Plans, Execution Order) instead of raw markdown; renders any embedded markdown tables as HTML tables. Header shows an overall progress bar, current phase/step, a refresh (re-read from disk) button, and a raw-source toggle.
3. **Milestones** — always shown; DB-backed milestones → phases → plans → linked tasks, independent of GSD.

If there's no `.planning/` directory, only the Milestones section renders.

### `.planning/` phase actions (state machine, per phase)

- No `PLAN.md` files yet, status `pending`/`planning` → **Plan Phase**: runs an inline Claude agent (no worktree) that writes `PLAN.md` files under `.planning/phases/phase-N/`.
- Has `PLAN.md` files but no board tasks yet, status `pending`/`planning` → **Generate Tasks**: parses the `PLAN.md` files and creates board tasks with wave-based dependencies; the queue picks them up immediately.
- Status `completed` → **Verify**: creates a task that runs `/gsd:verify-work` for that phase.
- Status `failed` → **Retry**: re-runs task generation from the existing `PLAN.md` files.
- **Preview parsed tasks** (before Generate Tasks): parses `PLAN.md` without creating anything; shows tasks grouped by wave (wave N runs after wave N-1), each with type, name, plan file, files touched, and done criteria. "Generate N tasks" inside the preview commits.

> **Note:** the DB-backed Milestones section (`PhaseCard.tsx`) has a *different* action set — Surface Assumptions, AI Plan Phase, Execute Phase, Validate Phase, Insert Phase — independent of the `.planning/`-file state machine above.

### Health & todos

- **Health** button calls `gsd_health_check`, reporting whether `.planning/` is healthy, degraded, or broken.
- **Todos** button lists everything under `.planning/todos/pending` and `.planning/todos/done` (recursively), each with area + preview. Captured via `/gsd:add-todo` in a Claude session.

## Edge cases

- GSD integration is fully optional — no `.planning/` means only the Milestones section, which supports its own milestones/phases/AI planning independent of GSD.
- Stale `.planning/` files on disk are only picked up on the explicit Refresh action (or a fresh phase-action round-trip), not live-watched.

## Key code

- `src-tauri/src/services/gsd.rs` — `.planning/` file parsing: `read_roadmap`/`parse_roadmap_phases`, `read_state`, `read_project`, `read_phase_details`, `parse_phase_plans`, `run_health_checks`, `list_todos`.
- `src-tauri/src/commands/gsd.rs` — Tauri commands: `gsd_check_status`, `gsd_health_check`, `gsd_list_todos`, `gsd_get_roadmap`, `gsd_get_state`, `gsd_get_project`, `gsd_get_phase_details`, `gsd_parse_phase_plans`, `gsd_create_tasks_from_plans`.
- `src-tauri/src/db/roadmap.rs` / `src-tauri/src/commands/roadmap.rs` — DB-backed Milestones/Phases/Plans CRUD, `plan_phase`, `approve_phase_plan`, `execute_phase`.
- `client/src/features/roadmap/RoadmapView.tsx` — top-level tab composing the three sections.
- `client/src/features/roadmap/GsdProjectOverview.tsx` — Project Overview panel.
- `client/src/features/roadmap/GsdFileRoadmap.tsx` — `.planning/` roadmap card, phase action state machine, Health/Todos buttons.
- `client/src/features/roadmap/phaseDescription.tsx` — structured phase-description parser/renderer (Goal/Depends on/Requirements/Success Criteria/Plans/Execution Order + markdown tables).
- `client/src/features/roadmap/PlanPreviewPanel.tsx` — "Preview parsed tasks" panel.
- `client/src/features/roadmap/MilestoneSection.tsx`, `PhaseCard.tsx`, `PlanRow.tsx` — DB-backed Milestones section.
