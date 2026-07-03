# Attachments API

File attachments on tasks — Tauri IPC only, no HTTP route exists for this surface.

## Commands
- Tauri command `get_attachments(taskId)` — returns `Vec<Attachment>` for a task. Registered but not called from `client/src` (attachments are normally read via `getTaskDetail`, which embeds them).
- Tauri command `upload_attachment(taskId, fileData, fileName, mimeType)` — writes `fileData` (byte array) to `<dataDir>/../uploads/<uuid>.<ext>`, inserts a DB row, and returns the created `Attachment`. Emits `task:attachments` with `{ taskId, attachments }` (full list for the task).
- Tauri command `delete_attachment(id)` — deletes the stored file (best-effort) and the DB row. Emits `task:attachmentDeleted` with `{ id, taskId }`.

## Notes
- `client/src/lib/api.ts` defines a web-fallback path for this feature (`uploadAttachments` posts multipart to `POST /api/tasks/:taskId/attachments`, `deleteAttachment` calls `DELETE /api/attachments/:id`), but `src-tauri/src/services/http_api.rs` registers no routes under `/api/attachments` or `/api/tasks/:id/attachments`. **Attachments only work in the Tauri desktop app** — the HTTP/web-fallback path 404s.
- The frontend uploads multiple files by calling `upload_attachment` once per file.
- Attachments are also embedded (read-only) in the `task_detail` / `get_task_detail` responses documented in `docs/api/tasks.md`.

## Key code
- `src-tauri/src/commands/attachments.rs` — Tauri commands
- `client/src/lib/api.ts` — `uploadAttachments` / `deleteAttachment` wrappers
