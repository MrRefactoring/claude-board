import { useState, useEffect } from 'react';
import type { SyntheticEvent } from 'react';
import { Plus, Pencil, Trash2, Shield, Globe, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { Role, AgentSuggestion } from '@/lib/types';
import { MODELS } from '@/lib/constants';
import { useTranslation } from '@/i18n/I18nProvider';
import { useCrudResource } from '@/hooks/useCrudResource';
import { queryKeys } from '@/lib/queryKeys';
import ModalShell from '@/components/ModalShell';
import EmptyState from '@/components/EmptyState';
import Spinner from '@/components/Spinner';
import InlineDeleteConfirm from '@/components/InlineDeleteConfirm';

const ROLE_COLORS = [
  '#6B7280',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
];

interface RoleFormProps {
  role: Role | null;
  onSave: (data: Partial<Role> & { global?: boolean }) => void;
  onCancel: () => void;
}

function RoleForm({ role, onSave, onCancel }: RoleFormProps) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [prompt, setPrompt] = useState(role?.prompt || '');
  const [color, setColor] = useState(role?.color || '#6B7280');
  const [model, setModel] = useState(role?.model || '');
  const [allowedTools, setAllowedTools] = useState(role?.allowed_tools || '');
  const [taskTypeAffinity, setTaskTypeAffinity] = useState(role?.task_type_affinity || '');
  const [isGlobal, setIsGlobal] = useState((role?.project_id as number | null | undefined) === null);

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      color,
      model: model || undefined,
      allowed_tools: allowedTools.trim() || undefined,
      task_type_affinity: taskTypeAffinity.trim() || undefined,
      global: isGlobal,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs text-surface-400 mb-1 block">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Senior Backend Developer"
          className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-claude"
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs text-surface-400 mb-1 block">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Experienced in Node.js, databases, and API design"
          className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-claude"
        />
      </div>
      <div>
        <label className="text-xs text-surface-400 mb-1 block">
          Prompt Instructions <span className="text-surface-600 font-normal ml-1">- injected into prompt</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="You are a senior backend developer with deep expertise in Node.js and PostgreSQL..."
          className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-claude resize-y"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-surface-400 mb-1 block">
            Model <span className="text-surface-600 font-normal">- pinned</span>
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-claude"
          >
            <option value="">Inherit from task</option>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-surface-400 mb-1 block">
            Good at <span className="text-surface-600 font-normal">- task types</span>
          </label>
          <input
            value={taskTypeAffinity}
            onChange={(e) => setTaskTypeAffinity(e.target.value)}
            placeholder="e.g. bugfix, refactor"
            className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-claude"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-surface-400 mb-1 block">
          Allowed tools <span className="text-surface-600 font-normal ml-1">- comma-separated; blank = all</span>
        </label>
        <input
          value={allowedTools}
          onChange={(e) => setAllowedTools(e.target.value)}
          placeholder="e.g. Read, Edit, Bash, mcp__claude-board__*"
          className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-claude font-mono text-xs"
        />
      </div>
      <div>
        <label className="text-xs text-surface-400 mb-1.5 block">Color</label>
        <div className="flex gap-1.5">
          {ROLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-1 ring-offset-surface-900 ring-white/60 scale-110' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer group">
          <button
            type="button"
            onClick={() => setIsGlobal(!isGlobal)}
            className={`relative w-8 h-4.5 rounded-full transition-colors ${isGlobal ? 'bg-claude' : 'bg-surface-700'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${isGlobal ? 'translate-x-3.5' : ''}`}
            />
          </button>
          <span className="text-xs text-surface-400 group-hover:text-surface-200 flex items-center gap-1">
            <Globe size={11} /> Shared across all projects
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-3 py-1.5 text-xs bg-claude hover:bg-claude-light text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {role?.id ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

interface RoleItemProps {
  role: Role;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  isGlobal?: boolean;
}

function RoleItem({ role, onEdit, onDelete, isGlobal }: RoleItemProps) {
  return (
    <div className="bg-surface-800/50 rounded-lg px-4 py-3 border border-surface-700/50">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
          <h3 className="text-sm font-medium text-surface-200">{role.name}</h3>
          {isGlobal && <Globe size={10} className="text-surface-500" />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(role)}
            className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(role)}
            className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {role.description && <p className="text-xs text-surface-400 mb-1">{role.description}</p>}
      {role.prompt && <p className="text-xs text-surface-500 whitespace-pre-wrap line-clamp-2">{role.prompt}</p>}
      {(role.model || role.task_type_affinity || role.allowed_tools) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {role.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium">
              {role.model}
            </span>
          )}
          {role.task_type_affinity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">
              {role.task_type_affinity}
            </span>
          )}
          {role.allowed_tools && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/60 text-surface-400 font-mono">
              tools ×{role.allowed_tools.split(',').filter(Boolean).length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  projectId: number;
  projectName: string;
  onClose: () => void;
}

export default function RolesModal({ projectId, projectName, onClose }: Props) {
  const { t } = useTranslation();
  const crud = useCrudResource<Role>({
    projectId,
    queryKey: queryKeys.roles(projectId),
    getAll: api.getRoles,
    create: api.createRole,
    update: api.updateRole,
    remove: api.deleteRole,
  });

  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [prefill, setPrefill] = useState<Partial<Role> | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getAgentSuggestions(projectId)
      .then((s) => {
        if (active) setSuggestions(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, crud.items.length]);

  const startFromSuggestion = (s: AgentSuggestion) => {
    setPrefill({
      name: `${s.task_type} specialist`,
      description: `Auto-suggested from ${s.count} recurring ${s.task_type} tasks`,
      model: s.model,
      task_type_affinity: s.task_type,
    });
    crud.setEditing('new');
  };

  const projectRoles = crud.items.filter((r) => (r.project_id as number | null | undefined) !== null);
  const globalRoles = crud.items.filter((r) => (r.project_id as number | null | undefined) === null);

  return (
    <ModalShell
      title={t('roles.title')}
      subtitle={`${projectName} — reusable agents & personas`}
      icon={Shield}
      onClose={onClose}
    >
      <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
        {crud.loading ? (
          <Spinner />
        ) : (
          <>
            {crud.items.length > 0 && !crud.editing && (
              <div className="space-y-2 mb-4">
                {projectRoles.length > 0 && (
                  <>
                    <div className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1">
                      Project Roles
                    </div>
                    {projectRoles.map((r) => (
                      <RoleItem key={r.id} role={r} onEdit={crud.setEditing} onDelete={crud.setDeleting} />
                    ))}
                  </>
                )}
                {globalRoles.length > 0 && (
                  <>
                    <div
                      className={`text-[10px] font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1 ${projectRoles.length > 0 ? 'mt-4 mb-1' : 'mb-1'}`}
                    >
                      <Globe size={10} /> Shared Roles
                    </div>
                    {globalRoles.map((r) => (
                      <RoleItem key={r.id} role={r} onEdit={crud.setEditing} onDelete={crud.setDeleting} isGlobal />
                    ))}
                  </>
                )}
              </div>
            )}

            {crud.items.length === 0 && !crud.editing && (
              <EmptyState
                icon={Shield}
                title={t('roles.noRoles')}
                description="Create roles to define persona for tasks"
              />
            )}

            {crud.editing && (
              <div className="bg-surface-800/30 rounded-lg p-4 border border-surface-700/50">
                <h3 className="text-xs font-medium text-surface-400 mb-3">
                  {crud.editing === 'new' ? 'New Role' : `Edit: ${crud.editing.name}`}
                </h3>
                <RoleForm
                  role={crud.editing === 'new' ? (prefill as Role | null) : crud.editing}
                  onSave={(data) => {
                    setPrefill(null);
                    void crud.handleSave(data);
                  }}
                  onCancel={() => {
                    setPrefill(null);
                    crud.setEditing(null);
                  }}
                />
              </div>
            )}

            {!crud.editing && suggestions.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <Sparkles size={10} className="text-amber-400" /> Suggested agents
                </div>
                <div className="space-y-1.5">
                  {suggestions.map((s) => (
                    <div
                      key={`${s.model}-${s.task_type}`}
                      className="flex items-center justify-between gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-surface-200">
                          <span className="font-medium capitalize">{s.task_type}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">
                            {s.model}
                          </span>
                          <span className="text-[10px] text-surface-500">×{s.count}</span>
                        </div>
                        {s.sample_titles.length > 0 && (
                          <p className="text-[10px] text-surface-500 truncate mt-0.5">{s.sample_titles.join(' · ')}</p>
                        )}
                      </div>
                      <button
                        onClick={() => startFromSuggestion(s)}
                        className="flex-shrink-0 px-2 py-1 text-[11px] font-medium bg-amber-500/15 text-amber-300 rounded-md hover:bg-amber-500/25 transition-colors"
                      >
                        Save agent
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!crud.editing && (
              <button
                onClick={() => {
                  setPrefill(null);
                  crud.setEditing('new');
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed border-surface-700 text-xs text-surface-400 hover:text-claude hover:border-claude/50 transition-colors"
              >
                <Plus size={14} /> {t('roles.addRole')}
              </button>
            )}
          </>
        )}
      </div>

      {crud.deleting && (
        <InlineDeleteConfirm
          message="Delete this role? Tasks using it will keep working without role instructions."
          onConfirm={() => crud.handleDelete(crud.deleting!.id)}
          onCancel={() => crud.setDeleting(null)}
        />
      )}
    </ModalShell>
  );
}
