# File Attachments

Files uploaded to a task that get copied into the agent's working directory as reference context.

## Behavior
1. Attach one or more files from the task creation form or the task detail view's Attachments tab.
2. Files are uploaded via `upload_attachment` and stored under `<data-dir>/../uploads/<uuid>.<ext>`; metadata (original name, mime type, size) goes in the `task_attachments` table.
3. When the task's runner starts, `copy_task_attachments` copies each attachment from the uploads dir into `<working_dir>/.claude-attachments/` (recreating the dir if it's a symlink, to prevent symlink attacks).
4. The generated prompt lists each attached file (name, mime type, size, and its `.claude-attachments/<file>` path) under an "Attached Files" section and instructs Claude to read them from that directory as needed — file contents are **not** inlined into the prompt text itself.

## Settings
- None — always available, no toggle.

## Edge cases
- Any file type is accepted; images render as previews in the UI, other files show a generic file icon and link to `/uploads/<filename>`.
- Large binary files are stored and copied but are only useful to Claude if it reads them explicitly via its file tools.

> **Note:** deleting a task does not clean up its attachments. `attachments::remove_by_task` exists in `src-tauri/src/db/attachments.rs` but is never called — `delete_task` in `src-tauri/src/commands/tasks.rs` removes the task row and its dependencies but leaves `task_attachments` rows and uploaded files orphaned on disk.

## Key code
- `src-tauri/src/commands/attachments.rs` — `get_attachments`, `upload_attachment`, `delete_attachment` commands
- `src-tauri/src/db/attachments.rs` — CRUD against `task_attachments`
- `src-tauri/src/claude/runner.rs` — `copy_task_attachments` (uploads dir → `.claude-attachments/`)
- `src-tauri/src/claude/prompt.rs` — "Attached Files" prompt section
- `client/src/features/tasks/TaskAttachmentsTab.tsx` — attachment list/delete UI in task detail
- `client/src/features/tasks/TaskOptionsPanel.tsx` — attach-on-create UI
- `client/src/lib/api.ts` — `uploadAttachments`, `deleteAttachment`
