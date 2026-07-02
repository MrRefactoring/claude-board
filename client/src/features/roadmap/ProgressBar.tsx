interface ProgressBarProps {
  total: number;
  done: number;
  inProgress: number;
  failed: number;
}

export function ProgressBar({ total, done, inProgress, failed }: ProgressBarProps) {
  if (total === 0) return <div className="h-1.5 bg-surface-700 rounded-full" />;
  const pDone = (done / total) * 100;
  const pActive = (inProgress / total) * 100;
  const pFailed = (failed / total) * 100;
  return (
    <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden flex">
      {pDone > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${pDone}%` }} />}
      {pActive > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${pActive}%` }} />}
      {pFailed > 0 && <div className="bg-red-500 transition-all" style={{ width: `${pFailed}%` }} />}
    </div>
  );
}
