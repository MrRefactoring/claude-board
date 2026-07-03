import { io } from 'socket.io-client';
import type { AppEventMap } from '@/lib/events';

/**
 * Minimal socket surface shared by both transports: the real Socket.IO client
 * (web mode) and a hand-rolled Tauri-events shim (desktop). Event payloads are
 * typed via AppEventMap; the transport-level connect/disconnect carry none.
 */
export interface AppSocket {
  connected: boolean;
  on<K extends keyof AppEventMap>(event: K, callback: (payload: AppEventMap[K]) => void): void;
  on(event: 'connect' | 'disconnect', callback: () => void): void;
  off<K extends keyof AppEventMap>(event: K, callback?: (payload: AppEventMap[K]) => void): void;
  off(event: 'connect' | 'disconnect', callback?: () => void): void;
  emit(...args: unknown[]): void;
}

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

let socket: AppSocket;

if (IS_TAURI) {
  // Tauri mode: bridge Tauri events onto a Socket.IO-shaped object.
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  // Import and register Tauri event listeners
  import('@tauri-apps/api/event')
    .then(({ listen }) => {
      const events = [
        'task:created',
        'task:updated',
        'task:deleted',
        'task:usage',
        'task:log',
        'task:attachments',
        'task:attachmentDeleted',
        'comment:created',
        'project:created',
        'project:updated',
        'project:deleted',
        'snippet:created',
        'snippet:updated',
        'snippet:deleted',
        'template:created',
        'template:updated',
        'template:deleted',
        'role:created',
        'role:updated',
        'role:deleted',
        'plan:started',
        'plan:log',
        'plan:phase',
        'plan:progress',
        'plan:stats',
        'plan:completed',
        'plan:cancelled',
        'claude:finished',
        'claude:limits',
      ];
      for (const name of events) {
        void listen(name, (event) => {
          const cbs = listeners.get(name);
          if (cbs) cbs.forEach((cb) => cb(event.payload));
        });
      }
    })
    .catch(console.error);

  socket = {
    connected: true,
    on(event: string, callback: (payload: unknown) => void) {
      if (event === 'connect') {
        setTimeout(callback, 0);
        return;
      }
      if (event === 'disconnect') return;
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(callback);
    },
    off(event: string, callback?: (payload: unknown) => void) {
      const cbs = listeners.get(event);
      if (cbs) {
        if (callback) cbs.delete(callback);
        else listeners.delete(event);
      }
    },
    emit() {},
  };
} else {
  // Web mode: use Socket.IO
  const URL = import.meta.env.DEV ? 'http://localhost:4000' : '/';
  socket = io(URL, { autoConnect: true });
}

export { socket };
