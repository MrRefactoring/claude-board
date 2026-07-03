# Codebase Scan

Runs Claude non-interactively over the project to produce a text analysis (tech stack, structure, patterns, etc.), previewed in a modal before being saved into the project's `CLAUDE.md` as context for future tasks.

## Behavior
1. User opens the Scan modal and picks a scan type, or writes a custom prompt.
2. `scan_codebase` (`src-tauri/src/commands/claude_manager.rs`) walks the working dir to get a file count and detected project types (`collect_codebase_stats`), emits `scan:stats`, then builds a prompt for the chosen scan type.
3. Runs `claude -p <prompt> --output-format text --max-turns <N> --dangerously-skip-permissions` as a blocking subprocess in the project's working dir. `max-turns` scales with file count: `10` (<5000 files), `15` (<20000), `20` (larger).
4. The result is inserted into the `scans` table (best-effort — failure doesn't block the response) and emitted via `scan:completed`. The modal shows it in an editable/searchable preview panel.
5. `save_scan_result` writes the content into `<project>/CLAUDE.md` under a `# Codebase Analysis (<type> scan, auto-generated)` header, either overwriting the file or appending a new `---`-separated section.

## States & transitions
Modal phase: `idle → scanning → preview → saved`, with `error` reachable from `scanning`. From `preview`: rescan (`→ scanning`) or discard (`→ idle`). From `saved`: rescan (`→ scanning`) or close.

## Settings
- `scan_type` — `quick`, `detailed` (default), `architecture`, or `custom`, each mapped to a distinct analysis prompt.
- `custom_prompt` — used verbatim when `scan_type = "custom"`.
- `mode` (save) — `overwrite` (default) or `append`.

## Edge cases
- Empty Claude output fails the command ("Scan returned empty result") instead of saving a blank analysis.
- Scan history is capped to the 20 most recent rows per project (`get_by_project`); a `cleanup_old` DB helper exists but is never invoked, so older rows accumulate until manually deleted (`delete_scan`).

## Key code
- `src-tauri/src/commands/claude_manager.rs` — `scan_codebase`, `save_scan_result`, `prescan_stats`, `get_scan_history`, `get_scan_detail`, `delete_scan`
- `src-tauri/src/db/scans.rs` — `scans` table CRUD
- `client/src/features/scan/ScanModal.tsx` — modal state machine, `scan:*` event listeners
- `client/src/features/scan/ScanIdleView.tsx` — scan-type picker, custom prompt, pre-scan stats
- `client/src/features/scan/ScanPreview.tsx` — result viewer/editor
- `client/src/features/scan/ScanFooter.tsx` — phase-specific actions
- `client/src/features/scan/ScanHistoryPanel.tsx` — history list/diff
