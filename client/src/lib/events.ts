import type { Task, Project, Snippet, Template, Role, Attachment, TaskComment } from '@/lib/types';

/**
 * Every realtime event the app listens for, mapped to its payload type.
 *
 * The same map backs both transports: Socket.IO in web mode and Tauri events
 * in the desktop app (see socket.ts / tauriEvents.ts). CRUD events carry the
 * affected entity; deletions carry just its id. Payloads we don't model
 * precisely yet are `unknown` so consumers must narrow.
 */
export interface AppEventMap {
  'task:created': Task;
  'task:updated': Partial<Task> & { id: number };
  'task:deleted': { id: number };
  'task:usage': {
    taskId: number;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
    total_cost?: number;
  };
  'task:log': unknown;
  'task:attachments': { taskId: number; attachments: Attachment[] };
  'task:attachmentDeleted': { taskId: number; id: number };
  'comment:created': { taskId: number; comment: TaskComment };

  'project:created': Project;
  'project:updated': Project;
  'project:deleted': { id: number };

  'snippet:created': Snippet;
  'snippet:updated': Snippet;
  'snippet:deleted': { id: number };

  'template:created': Template;
  'template:updated': Template;
  'template:deleted': { id: number };

  'role:created': Role;
  'role:updated': Role;
  'role:deleted': { id: number };

  'plan:started': unknown;
  'plan:log': unknown;
  'plan:phase': unknown;
  'plan:progress': unknown;
  'plan:stats': unknown;
  'plan:completed': unknown;
  'plan:cancelled': unknown;

  'claude:finished': unknown;
  'claude:limits': unknown;

  // Compact live activity log emitted by the AI chat during a run (Tauri-only).
  'chat:activity': { kind: string; label: string };

  // Tauri-only (emitted by the desktop shell, not in the Socket.IO list)
  'update:available': unknown;
  'update:ready': unknown;
  'menu:preferences': undefined;
}

export type AppEventName = keyof AppEventMap;
