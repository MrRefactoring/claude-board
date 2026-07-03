# Desktop Notifications

Native OS notifications (macOS/Windows, via `tauri-plugin-notification`) fired on task lifecycle events, so a user doesn't have to keep the board in view while agents run.

## Behavior
- Each event sends one native notification with title `Claude Board — <Event>` and a body of `[TASK-KEY] title` followed by an icon + status line (e.g. `✔ Completed — ready for review`).
- Body/title text is localized by the `language` app setting. Only `en` and `tr` string tables exist; any other value falls back to English.
- The app icon (`resources/icons/32x32.png`) is attached when present.
- Auto-test results reuse the task-level toggles: a passed auto-test fires under `notify_task_completed`, a failed one under `notify_task_failed`.
- Settings are read fresh from the DB on every send (no caching), so toggling in Settings applies immediately.

## Events
| Event | Icon | Default |
|-------|------|---------|
| Task Started | ▶ | off |
| Task Completed (+ test passed) | ✔ | on |
| Task Failed (+ test failed) | ✘ | on |
| Revision Requested | ↻ | on |
| Queue Auto-Started | ⏵ | off |

## Settings
- `notify_task_started` (bool, default false)
- `notify_task_completed` (bool, default true) — also gates the auto-test-passed notification and the git milestones (`notify_pr_created`/`notify_pr_merged`/`notify_branch_pushed`; see `../concepts/work-lifecycle.md`)
- `notify_task_failed` (bool, default true) — also gates the auto-test-failed notification
- `notify_revision_requested` (bool, default true)
- `notify_queue_started` (bool, default false)
- `language` (string, default `"en"`) — notification copy language (`en`/`tr` only)
- `sound_enabled` (bool, default true) — toggle exists in the Notifications settings tab but is **not read anywhere** in `notification.rs` (or elsewhere); it currently has no effect. Actual sound is entirely OS-controlled.

## Edge cases
- Empty/missing `task_key` — the `[KEY]` tag is omitted, body falls back to the bare title.
- Empty failure reason — body substitutes a localized "unknown error" string.

## Key code
- `src-tauri/src/services/notification.rs` — builds/sends all notifications, per-event gating, i18n strings
- `src-tauri/src/db/settings.rs` — setting fields, defaults, persistence
- `client/src/features/settings/NotificationsTab.tsx` — settings UI (includes the unwired `sound_enabled` toggle)
