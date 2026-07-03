# Battle View

An alternate visualization of the orchestration board: running/completed/failed tasks are rendered as agents fighting in an arena, driven by the same realtime task events as the rest of the board.

## Behavior
- Accessed from the Orchestration view's view-type switcher (`graph` / `timeline` / `live` / `battle`), Battle tab with a sword icon.
- Up to 6 fixed arena positions hold agents: running tasks (`in_progress` + actively executing) are "active", the 3 most recently finished tasks are "victory", the 2 most recently failed are "defeat".
- Each agent sprite shows: an assigned `agent_name` (server-generated, persisted on the task), a `boring-avatars` beam-style avatar keyed by that name, an HP bar, current token usage/cost, and a speech bubble with the last tool name (from `task:log` events where `logType === 'tool'`).
- HP: starts at 200, reduced by `tokens / 1000` from the task's accumulated token usage at mount.
- On each `task:usage` event, the attacking agent fires a projectile at a random other active agent (skipped if fewer than 2 active agents).
- Attack type is `ATTACK_TYPES[taskId % 6]` (fireball, lightning, plasma, ice, poison, bomb) — deterministic per task ID.
- Projectile size/power: `min(20, max(4, tokens / 15000))`. Damage: `min(40, max(1, tokens / 8000))`. Critical hit when power >= 14, shown as "CRIT! -N".
- On impact: target flashes/shakes, HP bar decreases (color transitions green → amber → red), an explosion (radial flash + shrapnel particles, larger on crits) and a floating damage number are rendered.
- File conflicts: polled every 3s via `getAgentActivity`; conflicting agent pairs get a dashed "VS" line drawn between them and a chip in the battle log below the arena.
- `task:updated` events with `status: 'done'`/`'testing'` or `'failed'` trigger a temporary victory/defeat flourish (trophy/skull, 5s) even for agents outside the fixed victory/defeat slots.
- Active agents bob with a sine-wave idle animation.

## Edge cases
- No running/recently-finished/recently-failed tasks → empty-state placeholder ("The Arena Awaits").
- Battle events (`task:usage`, `task:log`, `task:updated`) and conflict polling are Tauri-only (`IS_TAURI`); the web fallback mode renders the arena without live combat/conflict updates.

## Key code
- `client/src/features/board/BattleView.tsx` — arena, sprite, projectile/explosion/damage-number rendering, combat math.
- `client/src/features/board/OrchestrationView.tsx` — view-type switcher and Battle tab entry point.
- `src-tauri/src/claude/runner.rs` — `assign_agent_name` (server-side name assignment persisted to `tasks.agent_name`).
