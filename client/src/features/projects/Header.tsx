import { useState, useRef, useEffect, useMemo } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import {
  Plus,
  BarChart3,
  Wifi,
  WifiOff,
  Activity,
  Search,
  ChevronDown,
  Settings,
  Trash2,
  FolderPlus,
  FileText,
  LayoutGrid,
  Cpu,
  Coins,
  Clock,
  BookOpen,
  Layers,
  Bell,
  Shield,
  Sparkles,
  ScanSearch,
  Terminal,
  Wand2,
  SlidersHorizontal,
  MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Avatar from 'boring-avatars';
import { AVATAR_COLORS } from '@/lib/constants';
import { formatTokens as fmtTokens } from '@/lib/formatters';
import { useTranslation } from '@/i18n/I18nProvider';
import { IS_TAURI, IS_MACOS } from '@/lib/tauriEvents';
import Tooltip from '@/components/Tooltip';
import { useUIStore } from '@/store/uiStore';
import type { ModalName } from '@/store/uiStore';
import type { useProjectHandlers } from '@/hooks/useProjectHandlers';
import type { Task, Project } from '@/lib/types';

type AvatarVariant = 'marble' | 'beam' | 'pixel' | 'sunset' | 'ring' | 'bauhaus' | 'geometric' | 'abstract';

function ProjectUsage({ tasks }: { tasks?: Task[] }) {
  const totals = useMemo(() => {
    if (!tasks || tasks.length === 0) return null;
    let tokens = 0,
      cost = 0;
    for (const t of tasks) {
      tokens += (t.input_tokens || 0) + (t.output_tokens || 0);
      cost += t.total_cost || 0;
    }
    return tokens > 0 ? { tokens, cost } : null;
  }, [tasks]);

  if (!totals) return null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-surface-500 bg-surface-800/50 px-2.5 py-1 rounded-lg">
      <span className="flex items-center gap-1">
        <Cpu size={10} />
        {fmtTokens(totals.tokens)}
      </span>
      {totals.cost > 0 && (
        <span className="flex items-center gap-1">
          <Coins size={10} />${totals.cost.toFixed(4)}
        </span>
      )}
    </div>
  );
}

interface SettingsItem {
  key: string;
  icon: LucideIcon;
  labelKey: string;
  /** Modal opened by the item; 'project-settings' is special-cased to edit the current project. */
  modal: ModalName | 'project-settings';
}

const SETTINGS_ITEMS: SettingsItem[] = [
  { key: 'settings', icon: Settings, labelKey: 'header.settings', modal: 'project-settings' },
  { key: 'claude-md', icon: FileText, labelKey: 'header.claudeMd', modal: 'claudeMd' },
  { key: 'snippets', icon: BookOpen, labelKey: 'header.snippets', modal: 'snippets' },
  { key: 'templates', icon: Layers, labelKey: 'header.templates', modal: 'templates' },
  { key: 'roles', icon: Shield, labelKey: 'header.roles', modal: 'roles' },
  { key: 'webhooks', icon: Bell, labelKey: 'header.webhooks', modal: 'webhooks' },
  { key: 'commands', icon: Terminal, labelKey: 'header.commands', modal: 'commands' },
  { key: 'skills', icon: Wand2, labelKey: 'header.skills', modal: 'skills' },
  { key: 'app-settings', icon: SlidersHorizontal, labelKey: 'header.appSettings', modal: 'appSettings' },
];

interface HeaderProps {
  connected: boolean;
  tasks: Task[];
  projects: Project[];
  currentProject: Project | null;
  projectActions: ReturnType<typeof useProjectHandlers>;
}

export default function Header({ connected, tasks, projects, currentProject, projectActions }: HeaderProps) {
  const { t } = useTranslation();
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const openPlanning = useUIStore((s) => s.openPlanning);
  const togglePanel = useUIStore((s) => s.togglePanel);
  const activePanel = useUIStore((s) => s.activePanel);
  const chatActive = useUIStore((s) => !!s.modals.chat);
  const search = useUIStore((s) => s.search);
  const setSearch = useUIStore((s) => s.setSearch);
  const navigateToProject = useUIStore((s) => s.navigateToProject);
  const navigateToDashboard = useUIStore((s) => s.navigateToDashboard);

  const taskCount = tasks.length;
  const runningCount = tasks.filter((task) => task.is_running).length;

  const openSettingsItem = (item: SettingsItem) => {
    if (item.modal === 'project-settings') projectActions.onEdit();
    else openModal(item.modal);
  };

  useEffect(() => {
    if (!showProjectMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowProjectMenu(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showProjectMenu]);

  if (!currentProject) return null;

  const otherProjects = projects.filter((p) => p.id !== currentProject.id);

  return (
    <header
      data-tauri-drag-region
      className={`flex items-center justify-between py-2 sm:py-3 bg-surface-900 border-b border-surface-700/50 gap-2 ${
        IS_TAURI && IS_MACOS ? 'pl-[78px] pr-3 sm:pr-6' : 'px-3 sm:px-6'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Tooltip text={t('header.backToDashboard')}>
          <button
            onClick={navigateToDashboard}
            className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-claude transition-colors flex-shrink-0"
          >
            <LayoutGrid size={16} />
          </button>
        </Tooltip>

        <div className="relative min-w-0" ref={menuRef}>
          <button
            onClick={() => setShowProjectMenu(!showProjectMenu)}
            data-tour="project-selector"
            className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-surface-800 transition-colors min-w-0 max-w-full"
          >
            <div className="rounded-lg overflow-hidden flex-shrink-0">
              <Avatar
                size={24}
                name={currentProject.icon_seed || currentProject.name}
                variant={(currentProject.icon || 'marble') as AvatarVariant}
                colors={AVATAR_COLORS}
              />
            </div>
            <h1 className="text-sm sm:text-base font-semibold tracking-tight truncate">{currentProject.name}</h1>
            <ChevronDown
              size={14}
              className={`text-surface-400 flex-shrink-0 transition-transform ${showProjectMenu ? 'rotate-180' : ''}`}
            />
          </button>

          {showProjectMenu && (
            <div className="absolute left-0 sm:left-0 top-full mt-1 w-[calc(100vw-1.5rem)] sm:w-64 bg-surface-800 border border-surface-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
              {/* Settings grid */}
              {
                <div className="p-2">
                  <div className="grid grid-cols-3 gap-1">
                    {SETTINGS_ITEMS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          onClick={() => {
                            openSettingsItem(item);
                            setShowProjectMenu(false);
                          }}
                          className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-surface-400 hover:bg-surface-700 hover:text-surface-200 transition-colors"
                        >
                          <Icon size={14} />
                          <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              }

              {/* Switch project */}
              {otherProjects.length > 0 && (
                <>
                  <div className="border-t border-surface-700" />
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] text-surface-500 font-semibold uppercase tracking-wider">
                      {t('header.switchProject')}
                    </span>
                  </div>
                  <div className="px-1.5 pb-1.5 max-h-36 overflow-y-auto">
                    {otherProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          navigateToProject(p);
                          setShowProjectMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-surface-300 hover:bg-surface-700 transition-colors"
                      >
                        <div className="rounded-md overflow-hidden flex-shrink-0">
                          <Avatar
                            size={18}
                            name={p.icon_seed || p.name}
                            variant={(p.icon || 'marble') as AvatarVariant}
                            colors={AVATAR_COLORS}
                          />
                        </div>
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="border-t border-surface-700" />
              <div className="p-1.5 flex gap-1">
                <button
                  onClick={() => {
                    navigateToDashboard();
                    setShowProjectMenu(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-surface-400 hover:bg-surface-700 hover:text-surface-200 transition-colors"
                >
                  <LayoutGrid size={12} />
                  {t('header.dashboard')}
                </button>
                <button
                  onClick={() => {
                    openModal('project');
                    setShowProjectMenu(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-surface-400 hover:bg-surface-700 hover:text-surface-200 transition-colors"
                >
                  <FolderPlus size={12} />
                  {t('header.newProject')}
                </button>
                <button
                  onClick={() => {
                    projectActions.onDelete();
                    setShowProjectMenu(false);
                  }}
                  className="flex items-center justify-center px-2 py-1.5 rounded-lg text-[11px] text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  title="Delete Project"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-surface-400">
          {connected ? <Wifi size={13} className="text-emerald-400" /> : <WifiOff size={13} className="text-red-400" />}
          <span className="hidden lg:inline">{connected ? t('status.connected') : t('status.offline')}</span>
        </div>
        {!connected && <WifiOff size={13} className="text-red-400 sm:hidden" />}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            id="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('header.searchPlaceholder')}
            className="w-32 lg:w-44 pl-8 pr-3 py-1.5 bg-surface-800 border border-surface-700 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-claude focus:border-claude placeholder-surface-600"
          />
        </div>

        {/* Running badge */}
        {runningCount > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] sm:text-xs font-medium">
            <Activity size={11} className="animate-pulse" />
            <span>{runningCount}</span>
            <span className="hidden sm:inline">{t('header.running')}</span>
          </div>
        )}

        {/* Info: task count + usage */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-surface-500">
          <span className="whitespace-nowrap">
            {taskCount} {t('common.tasks')}
          </span>
          <ProjectUsage tasks={tasks} />
        </div>

        {/* Toolbar — compact icon toggle group */}
        <div className="flex items-center bg-surface-800/60 rounded-lg p-0.5 border border-surface-700/40">
          <ToolbarBtn
            icon={Clock}
            active={activePanel === 'activity'}
            onClick={() => togglePanel('activity')}
            title={t('header.activity')}
          />
          <ToolbarBtn
            icon={BarChart3}
            active={activePanel === 'stats'}
            onClick={() => togglePanel('stats')}
            title={t('header.stats')}
          />
          <ToolbarBtn icon={Sparkles} onClick={openPlanning} title="Planning" data-tour="planning-btn" />
          {IS_TAURI && (
            <ToolbarBtn
              icon={MessageSquare}
              active={chatActive}
              onClick={() => (chatActive ? closeModal('chat') : openModal('chat'))}
              title="AI Chat"
            />
          )}
          {IS_TAURI && (
            <ToolbarBtn icon={ScanSearch} onClick={() => openModal('scan')} title={t('header.scanCodebase')} />
          )}
        </div>

        {/* New Task */}
        <Tooltip text={t('header.newTask')} shortcut="N">
          <button
            onClick={() => openModal('task')}
            data-tour="new-task"
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-claude hover:bg-claude-light text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t('header.newTask')}</span>
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

interface ToolbarBtnProps extends ComponentPropsWithoutRef<'button'> {
  icon: LucideIcon;
  active?: boolean;
  shortcut?: string;
}

function ToolbarBtn({ icon: Icon, active, onClick, title, shortcut, ...rest }: ToolbarBtnProps) {
  return (
    <Tooltip text={title} shortcut={shortcut}>
      <button
        onClick={onClick}
        className={`p-1.5 rounded-md transition-colors ${
          active ? 'bg-claude/20 text-claude' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'
        }`}
        {...rest}
      >
        <Icon size={14} />
      </button>
    </Tooltip>
  );
}
