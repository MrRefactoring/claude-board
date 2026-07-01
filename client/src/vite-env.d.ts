/// <reference types="vite/client" />

// Injected by Vite `define` in vite.config.ts (used unguarded in Dashboard.tsx).
declare const __APP_VERSION__: string;

// Tauri v2 exposes its IPC bridge on the global window in a webview context.
interface TauriInternals {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

interface Window {
  __TAURI_INTERNALS__?: TauriInternals;
  // Web Speech API — non-standard globals assigned in test/setup and used by voice input.
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}

// Only VITE_MCP_PORT needs adding; vite/client already declares DEV/PROD/MODE.
interface ImportMetaEnv {
  readonly VITE_MCP_PORT?: string;
}
