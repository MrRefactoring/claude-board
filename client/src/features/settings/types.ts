export type SettingValue = boolean | string;

export interface AppSettings {
  launch_at_startup: boolean;
  minimize_to_tray: boolean;
  confirm_before_delete: boolean;
  default_model: string;
  default_effort: string;
  language: string;
  notify_task_completed: boolean;
  notify_task_failed: boolean;
  notify_task_started: boolean;
  notify_revision_requested: boolean;
  notify_queue_started: boolean;
  sound_enabled: boolean;
  auto_open_terminal: boolean;
  chat_bypass_permissions: boolean;
}
