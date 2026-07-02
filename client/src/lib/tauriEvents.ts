import { listen as tauriListenRaw } from '@tauri-apps/api/event';
import type { AppEventMap } from '@/lib/events';

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

/**
 * Call a Tauri UnlistenFn and swallow its rejection. `@tauri-apps/api`'s
 * unlisten is `async () => _unlisten(...)`, so invoking it on a listener whose
 * internal registry entry is already gone (React StrictMode double-invokes
 * effects in dev; the mount→cleanup→mount cycle can unlisten before/around
 * registration) rejects with `listeners[eventId].handlerId is undefined`.
 * That's benign — the listener is being torn down anyway — so we drop it
 * instead of letting it surface as an unhandled promise rejection.
 */
function safeUnlisten(fn: () => unknown): void {
  try {
    void Promise.resolve(fn()).catch(() => {});
  } catch {
    /* listener already torn down — nothing to do */
  }
}

/** Subscribe to a Tauri event with a payload typed by AppEventMap. Returns an
 *  unsubscribe fn. No-op (but still returns a disposer) outside the desktop shell. */
export function tauriListen<K extends keyof AppEventMap>(
  eventName: K,
  callback: (payload: AppEventMap[K]) => void,
): () => void {
  if (!IS_TAURI) return () => {};

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  tauriListenRaw<AppEventMap[K]>(eventName, (event) => {
    if (cancelled) return;
    callback(event.payload);
  })
    .then((fn) => {
      if (cancelled) safeUnlisten(fn);
      else unlisten = fn;
    })
    .catch(() => {
      /* listen registration failed — nothing subscribed, nothing to clean up */
    });

  return () => {
    cancelled = true;
    if (unlisten) safeUnlisten(unlisten);
  };
}

const IS_MACOS = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

export { IS_TAURI, IS_MACOS };
