# Task Keys

Auto-generated Jira-style identifier for every task, in the format `{TYPE}-{PROJECT}-{NUMBER}` (e.g. `FTR-CB-1001`).

## Behavior
- Generated on task creation by atomically incrementing the project's `task_counter` (starts at 1000, so first key is `...-1001`) and combining it with the task-type prefix and the project key.
- When a task's `task_type` changes, the key's prefix is replaced in place (old prefix → new prefix), preserving the project key and number.
- On server startup, any task missing a `task_key` is backfilled using the same prefix/project-key/counter logic.
- Displayed everywhere a task ID was previously shown: board cards, list view, timeline, task detail header, live terminal header.

## Format
- Type prefix: `feature`→`FTR`, `bugfix`→`BUG`, `refactor`→`RFT`, `docs`→`DOC`, `test`→`TST`, `chore`→`CHR`; any other type falls back to `TSK`.
- Project key: derived from the project slug — 2+ hyphen-separated words use up to the first 4 initials uppercased (`claude-board`→`CB`, `utd-games-website`→`UGW`); a single-word slug uses its first 3 alphabetic characters uppercased (`renkler`→`RNK`); empty/non-alphabetic slugs fall back to `PRJ`.

## Key code
- `src-tauri/src/db/tasks.rs` — `generate_task_key` (atomic counter increment via `RETURNING`, with UPDATE+SELECT fallback for older SQLite), key update on type change
- `src-tauri/src/db/schema.rs` — `get_type_prefix`, `generate_project_key`, `backfill_task_keys` (startup migration)
