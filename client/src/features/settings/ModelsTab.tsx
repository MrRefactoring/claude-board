import { useState } from 'react';
import { Plus, Trash, Edit2, Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Model, TranslateFn } from '@/lib/types';
import { refreshModels } from '@/lib/useModels';

interface ModelRow extends Model {
  id?: number;
  custom_id?: number;
}

interface EditingModel {
  mode: 'new' | 'edit';
  id?: number;
  model_id: string;
  label: string;
  color: string;
  input_cost_per_mtok: number | string;
  output_cost_per_mtok: number | string;
}

interface ModelsTabProps {
  t: TranslateFn;
  models: ModelRow[];
}

export default function ModelsTab({ t, models }: ModelsTabProps) {
  const builtins = models.filter((m) => m.source === 'builtin');
  const customs = models.filter((m) => m.source === 'custom');
  const [editing, setEditing] = useState<EditingModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startNew = () =>
    setEditing({
      mode: 'new',
      model_id: '',
      label: '',
      color: 'bg-cyan-500/20 text-cyan-300',
      input_cost_per_mtok: '',
      output_cost_per_mtok: '',
    });
  const startEdit = (m: ModelRow) =>
    setEditing({
      mode: 'edit',
      id: m.custom_id ?? m.id,
      model_id: m.value,
      label: m.label,
      color: m.color || '',
      input_cost_per_mtok: m.input_cost_per_mtok ?? '',
      output_cost_per_mtok: m.output_cost_per_mtok ?? '',
    });

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        modelId: editing.model_id.trim(),
        label: editing.label.trim(),
        color: editing.color.trim() || null,
        inputCostPerMtok: editing.input_cost_per_mtok === '' ? null : Number(editing.input_cost_per_mtok),
        outputCostPerMtok: editing.output_cost_per_mtok === '' ? null : Number(editing.output_cost_per_mtok),
        sortOrder: 0,
      };
      if (editing.mode === 'new') {
        await api.addCustomModel(payload as unknown as Partial<Model>);
      } else if (editing.id !== undefined) {
        await api.updateCustomModel(editing.id, payload as unknown as Partial<Model>);
      }
      await refreshModels();
      setEditing(null);
    } catch (e) {
      setError((e as Error | undefined)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm(t('settings.confirmDeleteModel'))) return;
    setBusy(true);
    try {
      await api.deleteCustomModel(id);
      await refreshModels();
    } catch (e) {
      setError((e as Error | undefined)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const renderForm = () => {
    if (!editing) return null;
    return (
      <div className="p-3 rounded-lg bg-surface-800/60 border border-claude/40 ring-1 ring-claude/20 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
              {t('settings.modelId')}
            </span>
            <input
              value={editing.model_id}
              onChange={(e) => setEditing({ ...editing, model_id: e.target.value })}
              placeholder="claude-opus-4-8"
              className="mt-1 w-full bg-surface-900 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-surface-200 font-mono focus:outline-none focus:ring-1 focus:ring-claude"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
              {t('settings.modelLabel')}
            </span>
            <input
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="Opus 4.8"
              className="mt-1 w-full bg-surface-900 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
              {t('settings.inputCost')}
            </span>
            <input
              type="number"
              step="0.01"
              value={editing.input_cost_per_mtok}
              onChange={(e) => setEditing({ ...editing, input_cost_per_mtok: e.target.value })}
              placeholder="5.00"
              className="mt-1 w-full bg-surface-900 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
              {t('settings.outputCost')}
            </span>
            <input
              type="number"
              step="0.01"
              value={editing.output_cost_per_mtok}
              onChange={(e) => setEditing({ ...editing, output_cost_per_mtok: e.target.value })}
              placeholder="25.00"
              className="mt-1 w-full bg-surface-900 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-surface-200 focus:outline-none focus:ring-1 focus:ring-claude"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-surface-500 font-semibold">
            {t('settings.modelColor')}
          </span>
          <input
            value={editing.color}
            onChange={(e) => setEditing({ ...editing, color: e.target.value })}
            placeholder="bg-cyan-500/20 text-cyan-300"
            className="mt-1 w-full bg-surface-900 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-surface-200 font-mono focus:outline-none focus:ring-1 focus:ring-claude"
          />
        </label>
        {error && <div className="text-[11px] text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancelEdit}
            disabled={busy}
            className="px-3 py-1.5 text-xs text-surface-300 bg-surface-700/50 hover:bg-surface-700 rounded-md disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !editing.model_id.trim() || !editing.label.trim()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-claude hover:bg-claude-light text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {t('common.save')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {builtins.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-surface-500 font-semibold mb-2">
            {t('settings.builtinModels')}
          </div>
          <div className="space-y-1.5">
            {builtins.map((m) => (
              <div
                key={m.value}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/40 border border-surface-700/30"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${m.color || 'bg-surface-700/50 text-surface-300'}`}
                  >
                    {m.value}
                  </span>
                  <span className="text-sm text-surface-200">{m.label}</span>
                </div>
                <div className="text-[10px] text-surface-500 font-mono">
                  ${m.input_cost_per_mtok ?? '?'} / ${m.output_cost_per_mtok ?? '?'} per Mtok
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-surface-500 font-semibold">
            {t(builtins.length > 0 ? 'settings.customModels' : 'settings.models')}
          </div>
          <button
            type="button"
            onClick={startNew}
            disabled={busy || editing !== null}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-claude/20 hover:bg-claude/30 text-claude disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={11} /> {t('settings.addModel')}
          </button>
        </div>
        {customs.length === 0 && !editing && (
          <div className="text-[11px] text-surface-500 px-3 py-3 rounded-lg bg-surface-800/30 border border-dashed border-surface-700/40">
            {t('settings.noCustomModels')}
          </div>
        )}
        {editing?.mode === 'new' && <div className="mb-2">{renderForm()}</div>}
        <div className="space-y-1.5">
          {customs.map((m) =>
            editing?.mode === 'edit' && editing.id === (m.custom_id ?? m.id) ? (
              <div key={m.value}>{renderForm()}</div>
            ) : (
              <div
                key={m.value}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/40 border border-surface-700/30"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${m.color || 'bg-surface-700/50 text-surface-300'}`}
                  >
                    {m.value}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-surface-200 truncate">{m.label}</div>
                    <div className="text-[10px] text-surface-500 font-mono">
                      ${m.input_cost_per_mtok ?? '—'} / ${m.output_cost_per_mtok ?? '—'} per Mtok
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(m)}
                    disabled={busy || editing !== null}
                    className="p-1.5 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-700/50 disabled:opacity-50"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => m.custom_id !== undefined && void remove(m.custom_id)}
                    disabled={busy || editing !== null}
                    className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
