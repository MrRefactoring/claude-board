import { listen as tauriListenRaw } from '@tauri-apps/api/event';
import type { AppEventMap } from './events';

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

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
  }).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });

  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}

const IS_MACOS = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

export { IS_TAURI, IS_MACOS };
