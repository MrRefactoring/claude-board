# Prompt Templates

Per-project, per-task-type reusable instruction blocks that get injected into a task's prompt automatically, so common boilerplate doesn't need to be retyped per task.

## Behavior
- A template has a `task_type` (one of `feature`/`bugfix`/`refactor`/`docs`/`test`/`chore`), a name/description, template text, and an optional `model`/`thinking_effort`.
- When a task starts, the backend looks up the most recent template with an exact `task_type` match for the project (`find_for_task`) — there is no manual "apply template" step at task creation.
- The matched template's raw text is inserted verbatim into the prompt as a `## Prompt Template: <name>` section, above the task title/description.
- The editor supports `{{variable_name}}` placeholders with user-defined name/label/placeholder/default, but this is **preview-only**: the live preview in the Templates modal substitutes each variable's default/placeholder value client-side. The actual prompt sent to Claude does **not** perform substitution — `{{...}}` placeholders are injected as literal text.

> **Note:** The doc previously described built-in variables (`{{project_name}}`, `{{task_title}}`, etc.) resolved at task start, and `model`/`thinking_effort` overriding task defaults. Neither is implemented: `model`/`thinking_effort` are stored on the template and editable in the UI but are never read when a task runs — only the template text is used.

## Edge cases
- No template matches the task's type → no template section is added; task runs with just its own description/criteria.

## Key code
- `src-tauri/src/db/templates.rs` — `prompt_templates` table, `find_for_task` (exact type match, newest first)
- `src-tauri/src/claude/runner.rs` — looks up the template before building the prompt
- `src-tauri/src/claude/prompt.rs` — `build_prompt` inserts `tmpl.template` verbatim
- `client/src/features/templates/TemplatesModal.tsx` — CRUD UI, variable editor, client-side `TemplatePreview` substitution
