import { useState } from 'react';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  User,
  FileCode,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FolderGit2,
  Copy,
  Upload,
} from 'lucide-react';
import type { Task } from '@/lib/types';
import { api, notifyError } from '@/lib/api';
import { IS_TAURI } from '@/lib/tauriEvents';
import { getDiffLineClass } from '@/features/tasks/taskDetailHelpers';
import type { TaskDetail } from '@/features/tasks/taskDetailHelpers';
import { useTranslation } from '@/i18n/I18nProvider';

interface Props {
  d: TaskDetail;
  detail: TaskDetail | null;
  task: Task;
  hasGit: boolean;
}

export function TaskGitTab({ d, detail, task, hasGit }: Props) {
  const { t } = useTranslation();
  const commits = detail?.commits || [];
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [fullDiff, setFullDiff] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [autoPr, setAutoPr] = useState<number | null | undefined>(task.auto_pr);
  const [pending, setPending] = useState<null | 'push' | 'pr'>(null);

  const worktreePath = task.worktree_path;
  const isPushed = task.pushed === 1 || !!d.pr_url;
  const isTesting = task.status === 'testing';
  const statusLabel = d.pr_url
    ? task.status === 'done'
      ? t('detail.statusPrMerged')
      : t('detail.statusPrOpen')
    : task.pushed === 1
      ? t('detail.statusPushed')
      : t('detail.statusLocalOnly');

  const doPush = () => {
    setPending('push');
    api
      .pushTaskBranch(task.id)
      .catch((e: unknown) => notifyError((e as Error).message || 'Push failed'))
      .finally(() => setPending(null));
  };
  const doCreatePr = () => {
    setPending('pr');
    api
      .createTaskPr(task.id)
      .catch((e: unknown) => notifyError((e as Error).message || 'Create PR failed'))
      .finally(() => setPending(null));
  };

  const setIntent = (value: boolean | null) => {
    const prev = autoPr;
    setAutoPr(value === null ? null : value ? 1 : 0);
    api.setTaskAutoPr(task.id, value).catch(() => setAutoPr(prev));
  };

  const intents: { v: boolean | null; label: string }[] = [
    { v: null, label: 'Inherit' },
    { v: true, label: 'On' },
    { v: false, label: 'Off' },
  ];

  return (
    <div className="space-y-4">
      {/* Per-task PR intent */}
      <div className="flex items-center justify-between bg-surface-800/40 rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-surface-300">
          <GitPullRequest size={13} className="text-purple-400" />
          {t('detail.autoPrForTask') || 'Auto-PR for this task'}
        </div>
        <div className="flex items-center gap-0.5 bg-surface-900/60 rounded-md p-0.5">
          {intents.map((o) => {
            const active =
              (o.v === null && (autoPr === null || autoPr === undefined)) ||
              (o.v === true && autoPr === 1) ||
              (o.v === false && autoPr === 0);
            return (
              <button
                key={String(o.v)}
                onClick={() => setIntent(o.v)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  active ? 'bg-purple-500/20 text-purple-300' : 'text-surface-500 hover:text-surface-300'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Work location — where the task's work lives right now, so it's never
          invisible: branch + push/PR status + worktree path (or "removed"). */}
      {task.branch_name && (
        <div className="bg-surface-800/40 rounded-lg px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-surface-300">
            <FolderGit2 size={13} className="text-violet-400" />
            {t('detail.workLocation')}
          </div>

          {/* Branch + status */}
          <div className="flex items-center gap-2 text-sm">
            <GitBranch size={13} className="text-violet-400 flex-shrink-0" />
            <code className="font-mono text-xs text-surface-200 truncate">{task.branch_name}</code>
            <button
              onClick={() => navigator.clipboard.writeText(task.branch_name || '')}
              className="text-surface-500 hover:text-surface-300 flex-shrink-0"
              title={t('detail.copy')}
            >
              <Copy size={11} />
            </button>
            <span
              className={`ml-auto text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                d.pr_url
                  ? 'bg-purple-500/15 text-purple-300'
                  : task.pushed === 1
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-surface-700/50 text-surface-400'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          {/* Worktree path, or a note once it's been removed */}
          <div className="flex items-center gap-2 text-[11px] text-surface-500">
            <FolderGit2 size={11} className="flex-shrink-0" />
            {worktreePath ? (
              <>
                <code className="font-mono truncate">{worktreePath}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(worktreePath)}
                  className="text-surface-600 hover:text-surface-300 flex-shrink-0"
                  title={t('detail.copy')}
                >
                  <Copy size={10} />
                </button>
              </>
            ) : (
              <span>{isPushed ? t('detail.worktreeRemoved') : t('detail.worktreeUnknown')}</span>
            )}
          </div>

          {/* Manual Testing-stage actions — Tauri-only */}
          {isTesting && IS_TAURI && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={doPush}
                disabled={pending !== null}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded bg-surface-700/60 text-surface-200 hover:bg-surface-700 disabled:opacity-50 transition-colors"
              >
                <Upload size={11} />
                {t('detail.pushBranch')}
                {pending === 'push' && (
                  <span className="w-2.5 h-2.5 rounded-full border border-surface-500 border-t-transparent animate-spin" />
                )}
              </button>
              {!d.pr_url && (
                <button
                  onClick={doCreatePr}
                  disabled={pending !== null}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
                >
                  <GitPullRequest size={11} />
                  {t('detail.createPr')}
                  {pending === 'pr' && (
                    <span className="w-2.5 h-2.5 rounded-full border border-purple-400 border-t-transparent animate-spin" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pull Request */}
      {d.pr_url && (
        <a
          href={d.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2.5 text-sm text-purple-300 hover:bg-purple-500/15 transition-colors"
        >
          <GitPullRequest size={14} />
          <span className="truncate">{d.pr_url}</span>
          <ExternalLink size={12} className="flex-shrink-0 ml-auto" />
        </a>
      )}

      {/* Commits */}
      {commits.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
            <GitCommit size={13} className="text-emerald-400" />
            {t('detail.commits')} ({commits.length})
          </h3>
          <div className="space-y-1">
            {commits.map((c) => (
              <div key={c.short} className="flex items-start gap-2 bg-surface-800/40 rounded-lg px-3 py-2 text-xs group">
                <code className="text-amber-400/80 font-mono text-[10px] mt-0.5 flex-shrink-0">{c.short}</code>
                <div className="flex-1 min-w-0">
                  <p className="text-surface-200 truncate">{c.message}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] text-surface-600">
                    {c.author && (
                      <span className="flex items-center gap-0.5">
                        <User size={8} />
                        {c.author}
                      </span>
                    )}
                    {c.date && <span>{new Date(c.date).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff stat */}
      {detail?.diff_stat && (
        <div>
          <h3 className="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
            <FileCode size={13} className="text-blue-400" />
            {t('detail.fileChanges')}
          </h3>
          <div className="bg-surface-800/40 rounded-lg px-4 py-3 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto">
            {detail.diff_stat.split('\n').map((line, i) => {
              const isSummary = line.includes('file') && line.includes('changed');
              // git --stat bars are a trailing run of '+' then '-'.
              const [, head = line, plus = '', minus = ''] = line.match(/^(.*?)(\+*)(-*)$/) ?? [];
              return (
                <div
                  key={i}
                  className={`whitespace-pre ${isSummary ? 'text-surface-300 font-semibold border-t border-surface-700/50 pt-2 mt-1' : 'text-surface-400'}`}
                >
                  {head}
                  {plus && <span className="text-emerald-400">{plus}</span>}
                  {minus && (isSummary ? minus : <span className="text-red-400">{minus}</span>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full diff */}
      {detail?.diff_stat && (
        <div>
          <button
            onClick={() => {
              if (!showFullDiff && fullDiff === null) {
                setDiffLoading(true);
                api
                  .getTaskDiff(task.id)
                  .then((r) => setFullDiff((r as { diff?: string }).diff || ''))
                  .catch(() => setFullDiff(''))
                  .finally(() => setDiffLoading(false));
              }
              setShowFullDiff(!showFullDiff);
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-surface-400 hover:text-surface-300 transition-colors"
          >
            {showFullDiff ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <FileDiff size={12} className="text-violet-400" />
            {t('detail.viewFullDiff')}
            {diffLoading && (
              <div className="w-3 h-3 rounded-full border border-surface-600 border-t-claude animate-spin ml-1" />
            )}
          </button>
          {showFullDiff && fullDiff !== null && (
            <div className="mt-2 bg-surface-950 border border-surface-800 rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-auto">
                {fullDiff ? (
                  <pre className="text-[11px] font-mono leading-[1.6]">
                    {fullDiff.split('\n').map((line, i) => {
                      const cls = getDiffLineClass(line);
                      return (
                        <div key={i} className={cls}>
                          <span className="text-surface-700 select-none inline-block w-8 text-right mr-3">{i + 1}</span>
                          {line}
                        </div>
                      );
                    })}
                  </pre>
                ) : (
                  <div className="text-center py-8 text-surface-600 text-xs">{t('detail.noDiff')}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No git info */}
      {!hasGit && <div className="text-center text-surface-600 text-xs py-8">{t('detail.noGitInfo')}</div>}
    </div>
  );
}
