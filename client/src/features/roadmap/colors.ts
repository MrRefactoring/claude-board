import { Zap, Eye, AlertTriangle, Hand } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const PHASE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-surface-700 text-surface-400',
  planning: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  verifying: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
};

export const PLAN_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-surface-700 text-surface-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
};

export const MS_STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  archived: 'bg-surface-700 text-surface-500 border-surface-600',
};

export const CHECKPOINT_ICONS: Record<string, LucideIcon> = {
  auto: Zap,
  'human-verify': Eye,
  decision: AlertTriangle,
  'human-action': Hand,
};

export const CHECKPOINT_COLORS: Record<string, string> = {
  auto: 'text-surface-500',
  'human-verify': 'text-purple-400',
  decision: 'text-amber-400',
  'human-action': 'text-rose-400',
};

export const GSD_PHASE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-surface-700 text-surface-400',
  planning: 'bg-blue-500/20 text-blue-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  verifying: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  skipped: 'bg-surface-600 text-surface-500',
};
