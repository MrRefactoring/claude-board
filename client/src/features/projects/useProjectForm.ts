import { useState, useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';
import { api } from '@/lib/api';
import { IS_TAURI } from '@/lib/tauriEvents';
import { useGitRepoStatus } from '@/lib/useGitRepoStatus';
import { useModels } from '@/lib/useModels';
import type { Project } from '@/lib/types';

/**
 * The Project shape plus the extended automation/engine/github columns the modal
 * reads/writes but which aren't (yet) part of the shared Project type.
 */
export interface ProjectFormProject extends Project {
  auto_push?: number;
  auto_merge?: number;
  auto_test?: number;
  test_prompt?: string;
  task_timeout_minutes?: number;
  max_retries?: number;
  max_auto_revisions?: number;
  retry_base_delay_secs?: number;
  retry_max_delay_secs?: number;
  auto_test_model?: string;
  circuit_breaker_threshold?: number;
  require_approval?: number | boolean;
  pr_provider?: string;
  github_repo?: string;
  github_sync_enabled?: number | boolean;
}

/** The camelCase values the modal submits to its parent. */
export interface ProjectFormValues {
  name: string;
  slug: string;
  workingDir: string;
  icon: string;
  iconSeed: string;
  permissionMode: string;
  allowedTools: string;
  autoQueue: boolean;
  maxConcurrent: number;
  autoBranch: boolean;
  autoPr: boolean;
  autoPush: boolean;
  autoMerge: boolean;
  prBaseBranch: string;
  autoTest: boolean;
  testPrompt: string;
  taskTimeoutMinutes: number;
  maxRetries: number;
  maxAutoRevisions: number;
  retryBaseDelaySecs: number;
  retryMaxDelaySecs: number;
  autoTestModel: string;
  circuitBreakerThreshold: number;
  requireApproval: boolean;
  prProvider: string;
  githubRepo: string;
  githubSyncEnabled: number;
}

export function useProjectForm(
  project: ProjectFormProject | null | undefined,
  onSubmit: (values: ProjectFormValues) => void | Promise<void>,
) {
  const [tab, setTab] = useState<string>('general');
  const [name, setName] = useState(project?.name || '');
  const [slug, setSlug] = useState(project?.slug || '');
  const [workingDir, setWorkingDir] = useState(project?.working_dir || '');
  const [icon, setIcon] = useState(project?.icon || 'marble');
  const [iconSeed, setIconSeed] = useState(project?.icon_seed || '');
  const [permissionMode, setPermissionMode] = useState(project?.permission_mode || 'auto-accept');
  const [allowedTools, setAllowedTools] = useState(project?.allowed_tools || '');
  const [autoQueue, setAutoQueue] = useState(project?.auto_queue ? true : false);
  const [maxConcurrent, setMaxConcurrent] = useState(project?.max_concurrent || 1);
  const [autoBranch, setAutoBranch] = useState(project?.auto_branch !== undefined ? !!project?.auto_branch : true);
  const [autoPr, setAutoPr] = useState(project?.auto_pr ? true : false);
  const [autoPush, setAutoPush] = useState(project?.auto_push ? true : false);
  const [autoMerge, setAutoMerge] = useState(project?.auto_merge ? true : false);
  const [prBaseBranch, setPrBaseBranch] = useState(project?.pr_base_branch || 'main');
  const [autoTest, setAutoTest] = useState(project?.auto_test ? true : false);
  const [testPrompt, setTestPrompt] = useState(project?.test_prompt || '');
  const [taskTimeoutMinutes, setTaskTimeoutMinutes] = useState(project?.task_timeout_minutes || 0);
  const [maxRetries, setMaxRetries] = useState(project?.max_retries || 0);
  const [maxAutoRevisions, setMaxAutoRevisions] = useState(project?.max_auto_revisions || 0);
  const [retryBaseDelay, setRetryBaseDelay] = useState(project?.retry_base_delay_secs || 0);
  const [retryMaxDelay, setRetryMaxDelay] = useState(project?.retry_max_delay_secs || 0);
  const [autoTestModel, setAutoTestModel] = useState(project?.auto_test_model || '');
  const [circuitBreakerThreshold, setCircuitBreakerThreshold] = useState(project?.circuit_breaker_threshold || 0);
  const [requireApproval, setRequireApproval] = useState(!!project?.require_approval);
  const [prProvider, setPrProvider] = useState(project?.pr_provider || 'auto');
  const [githubRepo, setGithubRepo] = useState(project?.github_repo || '');
  const [githubSyncEnabled, setGithubSyncEnabled] = useState(!!project?.github_sync_enabled);
  const [githubValidating, setGithubValidating] = useState(false);
  const [githubValid, setGithubValid] = useState<string | null>(null);
  const [githubDetecting, setGithubDetecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoSlug, setAutoSlug] = useState(!project);
  const nameRef = useRef<HTMLInputElement>(null);
  const {
    status: gitStatus,
    loading: gitLoading,
    refresh: refreshGitStatus,
  } = useGitRepoStatus(workingDir, {
    enabled: IS_TAURI,
  });
  const { models: availableModels } = useModels();
  const isGitRepo = gitStatus?.isRepo === true;
  // Until the probe completes (or in web mode where we can't probe) treat as repo
  // to avoid flashing the warning. In Tauri the probe is fast.
  const gitGateUnknown = !IS_TAURI || gitStatus === null;
  const gitDisabled = !gitGateUnknown && !isGitRepo;
  const [gitInitBusy, setGitInitBusy] = useState(false);
  const [gitInitError, setGitInitError] = useState<string | null>(null);

  // Force git automation toggles off when the working dir is confirmed non-repo.
  useEffect(() => {
    if (gitDisabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate constraint sync: git automation toggles are forced off when the dir is confirmed non-repo
      if (autoBranch) setAutoBranch(false);
      if (autoPr) setAutoPr(false);
      if (autoPush) setAutoPush(false);
      if (autoMerge) setAutoMerge(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitDisabled]);

  const handleGitInit = async () => {
    if (!workingDir.trim() || gitInitBusy) return;
    setGitInitBusy(true);
    setGitInitError(null);
    try {
      await api.initGitRepo(workingDir.trim(), prBaseBranch.trim() || 'main');
      refreshGitStatus();
    } catch (e) {
      setGitInitError((e as Error)?.message || String(e));
    } finally {
      setGitInitBusy(false);
    }
  };

  useEffect(() => {
    if (tab === 'general') nameRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'github' || githubRepo || !workingDir) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch effect: the sync detecting-flag toggle marks the lookup start
    setGithubDetecting(true);
    api
      .githubDetectRepo(workingDir)
      .then((repo) => {
        if (typeof repo === 'string' && repo) setGithubRepo(repo);
      })
      .catch((e: unknown) => console.error('Failed to detect GitHub repo:', e))
      .finally(() => setGithubDetecting(false));
  }, [tab, workingDir, githubRepo]);

  const generateSlug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleNameChange = (val: string) => {
    setName(val);
    if (autoSlug) setSlug(generateSlug(val));
  };

  const randomizeSeed = () => setIconSeed(Math.random().toString(36).substring(2, 10));
  const avatarSeed = iconSeed || name || 'project';

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !workingDir.trim()) return;
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        workingDir: workingDir.trim(),
        icon,
        iconSeed,
        permissionMode,
        allowedTools: allowedTools.trim(),
        autoQueue: autoQueue,
        maxConcurrent,
        autoBranch: autoBranch,
        autoPr: autoPr,
        autoPush: autoPush,
        autoMerge: autoMerge,
        prBaseBranch: prBaseBranch.trim() || 'main',
        autoTest: autoTest,
        testPrompt: testPrompt.trim(),
        taskTimeoutMinutes: taskTimeoutMinutes || 0,
        maxRetries: maxRetries || 0,
        maxAutoRevisions: maxAutoRevisions || 0,
        retryBaseDelaySecs: retryBaseDelay || 0,
        retryMaxDelaySecs: retryMaxDelay || 0,
        autoTestModel: autoTestModel || '',
        circuitBreakerThreshold: circuitBreakerThreshold || 0,
        requireApproval: requireApproval,
        prProvider: prProvider || 'auto',
        githubRepo,
        githubSyncEnabled: githubSyncEnabled ? 1 : 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return {
    tab,
    setTab,
    name,
    handleNameChange,
    nameRef,
    slug,
    setSlug,
    setAutoSlug,
    workingDir,
    setWorkingDir,
    icon,
    setIcon,
    avatarSeed,
    randomizeSeed,
    permissionMode,
    setPermissionMode,
    allowedTools,
    setAllowedTools,
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
    prBaseBranch,
    setPrBaseBranch,
    autoTest,
    setAutoTest,
    testPrompt,
    setTestPrompt,
    taskTimeoutMinutes,
    setTaskTimeoutMinutes,
    maxRetries,
    setMaxRetries,
    maxAutoRevisions,
    setMaxAutoRevisions,
    retryBaseDelay,
    setRetryBaseDelay,
    retryMaxDelay,
    setRetryMaxDelay,
    autoTestModel,
    setAutoTestModel,
    circuitBreakerThreshold,
    setCircuitBreakerThreshold,
    requireApproval,
    setRequireApproval,
    prProvider,
    setPrProvider,
    githubRepo,
    setGithubRepo,
    githubSyncEnabled,
    setGithubSyncEnabled,
    githubValidating,
    setGithubValidating,
    githubValid,
    setGithubValid,
    githubDetecting,
    setGithubDetecting,
    loading,
    gitStatus,
    gitLoading,
    gitDisabled,
    gitInitBusy,
    gitInitError,
    handleGitInit,
    availableModels,
    handleSubmit,
  };
}

export type ProjectForm = ReturnType<typeof useProjectForm>;
