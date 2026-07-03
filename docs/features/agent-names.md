# Agent Names

Random per-task identity so concurrently running agents are distinguishable in the UI and logs.

## Behavior
- When a task transitions to `in_progress` and its runner starts, `assign_agent_name` picks a name from a fixed 30-name pool (`Nova`, `Atlas`, `Spark`, `Echo`, `Pulse`, `Drift`, `Flux`, `Blaze`, `Cipher`, `Nexus`, `Orbit`, `Prism`, `Surge`, `Volt`, `Apex`, `Helix`, `Pixel`, `Byte`, `Quark`, `Zephyr`, `Onyx`, `Jade`, `Iris`, `Sol`, `Astra`, `Cosmo`, `Flare`, `Rune`, `Vega`, `Luna`) via `(task_id + random) % 30` and persists it to the task.
- Selection is randomized per assignment, not deterministic from `task_id` — the same task can get a different name across restarts/reruns.
- Shown on: the agent card in the orchestration board (`AgentCard.tsx`), Battle View sprite name tag (`BattleView.tsx`), and the task's start-up log line ("Agent Nova starting task: ...").
- Each agent also renders an avatar via `boring-avatars` (`variant="beam"`, fixed `AVATAR_COLORS` palette), keyed on the agent name — same name always renders the same avatar since generation is deterministic on the input string.
- Both the agent card and Battle View show a speech-bubble style indicator with the agent's last tool call (name + affected path).
- Falls back to `Agent {task.id}` in the UI if `agent_name` is empty.

## Settings
- None — not configurable.

## Key code
- `src-tauri/src/claude/runner.rs` — `AGENT_NAMES` pool, `assign_agent_name`, start-up log line
- `src-tauri/src/db/tasks.rs` — `set_agent_name`, `agent_name` field on `Task`
- `src-tauri/src/db/schema.rs` — `agent_name TEXT DEFAULT ''` column on `tasks`
- `client/src/features/board/AgentCard.tsx` — avatar + name rendering in orchestration view
- `client/src/features/board/BattleView.tsx` — avatar + name tag in battle view
- `client/src/lib/constants.ts` — `AVATAR_COLORS`
