import type { ReactNode } from 'react';
import { RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

export const INPUT =
  'px-2.5 py-1.5 bg-surface-900 border border-surface-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-claude';
export const BTN_PRIMARY =
  'px-3 py-1.5 font-medium bg-claude hover:bg-claude-light rounded-lg disabled:opacity-50 text-xs';

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12 text-surface-600">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}
export function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-8 text-surface-600 text-sm">{message}</div>;
}
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-[11px] text-red-400">{message}</p>
    </div>
  );
}
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-surface-500">{label}</span>
      <span className="text-[11px] text-surface-300 font-medium">{value}</span>
    </div>
  );
}
export function Badge({ color, children }: { color: string; children: ReactNode }) {
  const c: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
    surface: 'bg-surface-700 text-surface-400',
  };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded ${c[color] || c.surface}`}>{children}</span>;
}
export function RefreshBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-500 hover:text-surface-300">
      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
    </button>
  );
}
