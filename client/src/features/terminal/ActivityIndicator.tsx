import { useMemo } from 'react';
import { Brain } from 'lucide-react';
import { getToolIcon, getToolColor } from '@/features/terminal/terminalConstants';
import { basename } from '@/features/terminal/terminalHelpers';
import type { LogLine } from '@/features/terminal/terminalHelpers';

interface ActivityIndicatorProps {
  logs: LogLine[];
  isRunning?: boolean;
}

type ActivityStatus =
  | { phase: 'tool'; toolName?: string; file?: string }
  | { phase: 'thinking' | 'deep_thinking' | 'starting' };

// ─── Activity indicator ───
export function ActivityIndicator({ logs, isRunning }: ActivityIndicatorProps) {
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the compiler cannot preserve this memo (early null return + nested scan) but it is correct and worth keeping on this hot path
  const status = useMemo<ActivityStatus | null>(() => {
    if (!isRunning) return null;
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      if (!l) continue;
      if (l.log_type === 'tool' && l.meta?.toolName && !l.meta.isResult) {
        // Check if this tool has a result
        const toolId = l.meta.toolId;
        const hasResult = logs.slice(i + 1).some((r) => r.log_type === 'tool_result' && r.meta?.toolId === toolId);
        if (!hasResult) {
          return { phase: 'tool', toolName: l.meta.toolName, file: l.meta.input?.file };
        }
      }
      if (l.log_type === 'tool_result') return { phase: 'thinking' };
      if (l.log_type === 'claude' && l.meta?.isThinking) return { phase: 'deep_thinking' };
      if (l.log_type === 'claude') return { phase: 'thinking' };
    }
    return { phase: 'starting' };
  }, [logs, isRunning]);

  if (!status) return null;

  if (status.phase === 'tool') {
    const Icon = getToolIcon(status.toolName);
    const color = getToolColor(status.toolName);
    return (
      <div className={`flex items-center gap-1.5 text-xs ${color}`}>
        {/* eslint-disable-next-line react-hooks/static-components -- getToolIcon returns stable module-level lucide components, not fresh ones */}
        <Icon size={12} className="animate-pulse" />
        <span className="font-medium">{status.toolName}</span>
        {status.file && <span className="text-surface-500 truncate max-w-[150px]">{basename(status.file)}</span>}
      </div>
    );
  }

  if (status.phase === 'deep_thinking') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-violet-400">
        <Brain size={12} className="animate-pulse" />
        <span className="font-medium">Thinking deeply...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-surface-500">
      <div className="w-2 h-2 rounded-full bg-claude animate-pulse" />
      {status.phase === 'starting' ? 'Starting...' : 'Thinking...'}
    </div>
  );
}
