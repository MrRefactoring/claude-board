import { Github, GitBranch, Info, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { api } from '@/lib/api';
import { Section, Field, ToggleRow } from './formControls';
import type { ProjectForm } from './useProjectForm';

// ─── GitHub ──
export default function GithubSection({ form }: { form: ProjectForm }) {
  const { t } = useTranslation();
  const {
    githubSyncEnabled,
    setGithubSyncEnabled,
    githubRepo,
    setGithubRepo,
    githubValid,
    setGithubValid,
    githubDetecting,
    setGithubDetecting,
    githubValidating,
    setGithubValidating,
    workingDir,
  } = form;
  return (
    <div className="space-y-4">
      <Section title={t('projectModal.githubIssuesSync')} icon={Github}>
        <ToggleRow
          enabled={githubSyncEnabled}
          onToggle={() => setGithubSyncEnabled(!githubSyncEnabled)}
          label={githubSyncEnabled ? t('projectModal.syncEnabled') : t('projectModal.syncDisabled')}
          desc={t('projectModal.syncDesc')}
          activeColor="violet"
        />

        {githubSyncEnabled && (
          <>
            <Field label={t('projectModal.repository')} hint={t('projectModal.repoHelpText')}>
              <div className="flex gap-2">
                <input
                  value={githubRepo}
                  onChange={(e) => {
                    setGithubRepo(e.target.value);
                    setGithubValid(null);
                  }}
                  placeholder="owner/repo"
                  className="input-field font-mono flex-1"
                />
                <button
                  type="button"
                  disabled={githubDetecting || !workingDir.trim()}
                  onClick={async () => {
                    setGithubDetecting(true);
                    try {
                      const repo = await api.githubDetectRepo(workingDir);
                      if (repo) {
                        setGithubRepo(typeof repo === 'string' ? repo : String(repo));
                        setGithubValid(null);
                      }
                    } catch (e) {
                      console.error('Failed to detect GitHub repo:', e);
                    }
                    setGithubDetecting(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-surface-800 border border-surface-700 text-surface-400 hover:text-surface-100 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {githubDetecting ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
                  {t('projectModal.detect')}
                </button>
              </div>
            </Field>

            {githubValid !== null && (
              <div
                className={`flex items-center gap-2.5 p-3 rounded-lg border ${
                  githubValid === 'ready'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : githubValid === 'not_installed'
                      ? 'bg-red-500/10 border-red-500/20 text-red-300'
                      : githubValid === 'not_authenticated'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                        : 'bg-red-500/10 border-red-500/20 text-red-300'
                }`}
              >
                {githubValid === 'ready' ? (
                  <CheckCircle2 size={14} />
                ) : githubValid === 'not_authenticated' ? (
                  <Info size={14} />
                ) : (
                  <XCircle size={14} />
                )}
                <span className="text-xs font-medium">
                  {githubValid === 'ready' && t('projectModal.ghReady')}
                  {githubValid === 'not_installed' && t('projectModal.ghNotInstalled')}
                  {githubValid === 'not_authenticated' && t('projectModal.ghNotAuth')}
                  {githubValid === 'no_access' && t('projectModal.ghNoAccess')}
                  {githubValid === 'authenticated' && t('projectModal.ghAuthenticated')}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={githubValidating || !githubRepo.trim()}
                onClick={async () => {
                  setGithubValidating(true);
                  setGithubValid(null);
                  try {
                    const result = await api.githubCheckStatus(githubRepo);
                    setGithubValid((result as { status?: string } | null)?.status || 'error');
                  } catch (e) {
                    console.error('Failed to check GitHub connection:', e);
                    setGithubValid('error');
                  } finally {
                    setGithubValidating(false);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-surface-800 border border-surface-700 text-surface-300 hover:text-surface-100 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {githubValidating ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {t('projectModal.checkConnection')}
              </button>
              <p className="text-xs text-surface-600">{t('projectModal.ghCliHelpText')}</p>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
