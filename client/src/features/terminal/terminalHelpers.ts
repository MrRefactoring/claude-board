// ─── Shared log/tool shapes for the live terminal ───
// Streamed log lines come from `api.getTaskLogs` (Promise<unknown>) and the
// `task:log` socket/Tauri events (typed `unknown` in AppEventMap). We model only
// the fields the terminal renders and narrow/cast at the boundary.

export interface ToolInput {
  file?: string;
  command?: string;
  pattern?: string;
  description?: string;
  prompt?: string;
  query?: string;
  glob?: string;
  editing?: boolean;
  oldString?: string;
  newString?: string;
  contentLength?: number;
  url?: string;
}

export interface LogMeta {
  isResult?: boolean;
  toolId?: string;
  toolName?: string;
  isThinking?: boolean;
  isError?: boolean;
  duration?: number;
  resultPreview?: string;
  resultLines?: number;
  input?: ToolInput;
}

export interface LogLine {
  log_type?: string;
  message?: string;
  created_at?: string;
  meta?: LogMeta | null;
}

export type GroupedEntry =
  | { type: 'turn_separator'; turn: number; time?: string }
  | { type: 'tool_group'; call: LogLine | null; result: LogLine | null; index: number }
  | { type: 'log'; log: LogLine; index: number };

// ─── Helpers ───
export function fmtTime(d?: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function fmtMs(ms?: number | null): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

export function fmtTokens(n?: number | null): string {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function basename(p?: string | null): string | null {
  if (!p) return null;
  return p.replace(/\\/g, '/').split('/').pop() ?? null;
}

export function shortenPath(p?: string | null): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return parts.join('/');
  return '…/' + parts.slice(-3).join('/');
}

// ─── Grouped tool call + result into a single card ───
export function groupToolEntries(logs: LogLine[]): GroupedEntry[] {
  const entries: GroupedEntry[] = [];
  let turnNumber = 0;
  let lastType: string | null = null;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!log) continue;

    // Insert turn separator when Claude speaks after tool results
    if (
      log.log_type === 'claude' &&
      lastType &&
      lastType !== 'claude' &&
      lastType !== 'system' &&
      lastType !== 'info'
    ) {
      turnNumber++;
      entries.push({ type: 'turn_separator', turn: turnNumber, time: log.created_at });
    }

    if (log.log_type === 'tool' && log.meta && !log.meta.isResult) {
      // Look ahead for matching result
      const toolId = log.meta.toolId;
      let result: LogLine | null = null;
      if (toolId) {
        for (let j = i + 1; j < logs.length && j < i + 20; j++) {
          const candidate = logs[j];
          if (candidate?.log_type === 'tool_result' && candidate.meta?.toolId === toolId) {
            result = candidate;
            break;
          }
        }
      }
      entries.push({ type: 'tool_group', call: log, result, index: i });
    } else if (log.log_type === 'tool_result' && log.meta) {
      // Skip if already consumed by a group
      const toolId = log.meta.toolId;
      const alreadyGrouped = entries.some((e) => e.type === 'tool_group' && e.result?.meta?.toolId === toolId);
      if (!alreadyGrouped) {
        entries.push({ type: 'tool_group', call: null, result: log, index: i });
      }
    } else {
      entries.push({ type: 'log', log, index: i });
    }

    lastType = log.log_type ?? null;
  }
  return entries;
}
