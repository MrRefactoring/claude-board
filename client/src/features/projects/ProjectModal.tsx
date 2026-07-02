import type { LucideIcon } from 'lucide-react';
import { X, FolderOpen, Shield, Settings, Workflow, Github, Cog, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { useProjectForm } from './useProjectForm';
import type { ProjectFormProject, ProjectFormValues } from './useProjectForm';
import GeneralSection from './GeneralSection';
import PermissionsSection from './PermissionsSection';
import AutomationSection from './AutomationSection';
import EngineSection from './EngineSection';
import GithubSection from './GithubSection';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface ProjectModalProps {
  project?: ProjectFormProject | null;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  onClose: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'automation', label: 'Automation', icon: Workflow },
  { id: 'engine', label: 'Engine', icon: Cog },
  { id: 'github', label: 'GitHub', icon: Github },
];

export default function ProjectModal({ project, onSubmit, onClose }: ProjectModalProps) {
  const { t } = useTranslation();
  const form = useProjectForm(project, onSubmit);
  const { tab, setTab, name, slug, workingDir, loading, handleSubmit } = form;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-[720px] mx-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-claude/10 flex items-center justify-center">
              <FolderOpen size={16} className="text-claude" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {project ? t('projectModal.editProject') : t('projectModal.newProject')}
              </h2>
              {project && <p className="text-xs text-surface-500 mt-0.5 font-mono">{project.slug}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0">
          {/* Sidebar Navigation */}
          <nav className="w-44 flex-shrink-0 border-r border-surface-800 py-3 px-2 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all mb-0.5 ${
                    active
                      ? 'bg-claude/10 text-claude font-medium'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
                  }`}
                >
                  <Icon size={14} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={12} className="opacity-50" />}
                </button>
              );
            })}
          </nav>

          {/* Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {tab === 'general' && <GeneralSection form={form} />}
              {tab === 'permissions' && <PermissionsSection form={form} />}
              {tab === 'automation' && <AutomationSection form={form} />}
              {tab === 'engine' && <EngineSection form={form} />}
              {tab === 'github' && <GithubSection form={form} />}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-800 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim() || !slug.trim() || !workingDir.trim()}
                className="px-6 py-2.5 text-sm font-medium bg-claude hover:bg-claude-light disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm shadow-claude/20"
              >
                {loading ? t('common.saving') : project ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
