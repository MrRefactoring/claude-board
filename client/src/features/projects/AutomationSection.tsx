import { Zap, GitBranch, Info, Loader2, FlaskConical, Timer } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { IS_TAURI } from '@/lib/tauriEvents';
import { Section, Field, ToggleRow } from './formControls';
import type { ProjectForm } from './useProjectForm';

// ─── Automation ──
export default function AutomationSection({ form }: { form: ProjectForm }) {
  const { t } = useTranslation();
  const {
    autoQueue,
    setAutoQueue,
    maxConcurrent,
    setMaxConcurrent,
    autoBranch,
    setAutoBranch,
    autoPr,
    setAutoPr,
    autoPush,
    setAutoPush,
    autoMerge,
    setAutoMerge,
    prProvider,
    setPrProvider,
    autoTest,
    setAutoTest,
    testPrompt,
    setTestPrompt,
    taskTimeoutMinutes,
    setTaskTimeoutMinutes,
    maxRetries,
    setMaxRetries,
    workingDir,
    gitStatus,
    gitLoading,
    gitDisabled,
    gitInitBusy,
    gitInitError,
    handleGitInit,
  } = form;
  return (
    <div className="space-y-4">
      {/* Task Queue */}
      <Section title={t('projectModal.taskQueue')} icon={Zap}>
        <ToggleRow
          enabled={autoQueue}
          onToggle={() => setAutoQueue(!autoQueue)}
          label={autoQueue ? t('projectModal.autoQueueEnabled') : t('projectModal.autoQueueDisabled')}
          desc={t('projectModal.autoQueueDesc')}
          activeColor="emerald"
        />
        {autoQueue && (
          <Field label={t('projectModal.maxConcurrent')}>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxConcurrent(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                    maxConcurrent === n
                      ? 'bg-claude text-white shadow-sm shadow-claude/20'
                      : 'bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={50}
                value={maxConcurrent}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= 50) setMaxConcurrent(v);
                }}
                className="w-16 h-9 rounded-lg text-sm font-medium text-center bg-surface-800 border border-surface-700 text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </Field>
        )}
      </Section>

      {/* Git Workflow */}
      <Section title={t('projectModal.gitWorkflow')} icon={GitBranch}>
        {gitDisabled && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Info size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-200 leading-relaxed">{t('projectModal.notGitRepoWarning')}</p>
              {IS_TAURI && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={gitInitBusy || !workingDir.trim()}
                    onClick={handleGitInit}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {gitInitBusy ? <Loader2 size={11} className="animate-spin" /> : <GitBranch size={11} />}
                    {t('projectModal.gitInit')}
                  </button>
                  {gitInitError && <span className="text-[11px] text-red-300">{gitInitError}</span>}
                </div>
              )}
            </div>
          </div>
        )}
        {gitLoading && IS_TAURI && (
          <div className="flex items-center gap-2 text-[11px] text-surface-500 pb-1">
            <Loader2 size={11} className="animate-spin" /> {t('projectModal.checkingGit')}
          </div>
        )}
        <div className={`grid gap-2 ${gitDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <ToggleRow
            enabled={autoBranch && !gitDisabled}
            onToggle={() => !gitDisabled && setAutoBranch(!autoBranch)}
            label={t('projectModal.autoBranch')}
            desc={t('projectModal.autoBranchDesc')}
            activeColor="violet"
          />
          <ToggleRow
            enabled={autoMerge && !gitDisabled}
            onToggle={() => !gitDisabled && setAutoMerge(!autoMerge)}
            label={t('projectModal.autoMerge')}
            desc={t('projectModal.autoMergeDesc')}
            activeColor="violet"
          />
          <ToggleRow
            enabled={autoPush && !gitDisabled}
            onToggle={() => !gitDisabled && setAutoPush(!autoPush)}
            label={t('projectModal.autoPush')}
            desc={t('projectModal.autoPushDesc')}
            activeColor="violet"
          />
          <ToggleRow
            enabled={autoPr && !gitDisabled}
            onToggle={() => !gitDisabled && setAutoPr(!autoPr)}
            label={t('projectModal.autoPR')}
            desc={t('projectModal.autoPRDesc')}
            activeColor="violet"
          />
        </div>

        {autoPr && !gitDisabled && (
          <Field label={t('projectModal.prProvider')} hint={t('projectModal.prProviderHint')}>
            <select value={prProvider} onChange={(e) => setPrProvider(e.target.value)} className="input-field">
              <option value="auto">{t('projectModal.prProviderAuto')}</option>
              <option value="github">GitHub (gh CLI)</option>
              <option value="gitlab">GitLab (glab CLI)</option>
              <option value="azure_devops">Azure DevOps (az CLI)</option>
              <option value="gitea">Gitea / Forgejo (tea CLI)</option>
              <option value="none">{t('projectModal.prProviderNone')}</option>
            </select>
            {prProvider === 'auto' && gitStatus?.detectedProvider && gitStatus.detectedProvider !== 'unknown' && (
              <p className="text-[10px] text-emerald-400 mt-1">
                {t('projectModal.detectedProvider')}: <span className="font-medium">{gitStatus.detectedProvider}</span>
              </p>
            )}
            {prProvider === 'auto' && gitStatus?.detectedProvider === 'unknown' && gitStatus.hasRemote && (
              <p className="text-[10px] text-amber-400 mt-1">{t('projectModal.providerNotDetected')}</p>
            )}
          </Field>
        )}
      </Section>

      {/* Auto Test */}
      <Section title={t('projectModal.autoTest')} icon={FlaskConical}>
        <ToggleRow
          enabled={autoTest}
          onToggle={() => setAutoTest(!autoTest)}
          label={autoTest ? t('projectModal.autoTestEnabled') : t('projectModal.autoTestDisabled')}
          desc={t('projectModal.autoTestDescription')}
          activeColor="emerald"
        />
        {autoTest && (
          <Field label={t('projectModal.customTestInstructions')} hint={t('projectModal.customTestPlaceholder')}>
            <textarea
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="e.g. Run 'npm test' and check all tests pass."
              rows={3}
              className="input-field resize-none font-mono"
            />
          </Field>
        )}
      </Section>

      {/* Timeout & Retries */}
      <Section title={t('projectModal.taskTimeout') + ' & ' + t('projectModal.maxRetries')} icon={Timer}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('projectModal.taskTimeout')} hint={t('projectModal.taskTimeoutDesc')}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1440}
                value={taskTimeoutMinutes || ''}
                onChange={(e) => setTaskTimeoutMinutes(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="input-field w-20"
              />
              <span className="text-xs text-surface-500">{t('projectModal.minutesNoLimit')}</span>
            </div>
          </Field>
          <Field label={t('projectModal.maxRetries')} hint={t('projectModal.maxRetriesDesc')}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={10}
                value={maxRetries || ''}
                onChange={(e) => setMaxRetries(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="input-field w-20"
              />
              <span className="text-xs text-surface-500">{t('projectModal.timesDefault')}</span>
            </div>
          </Field>
        </div>
      </Section>
    </div>
  );
}
