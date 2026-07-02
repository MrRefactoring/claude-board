import { useState, useEffect } from 'react';
import { api } from './api';
import type { Model } from './types';

// Mirrors src-tauri/src/commands/models.rs `default_seed_models()` — used as a
// transient fallback before the backend list arrives (or in web-only mode).
// In the desktop app these are seeded into the editable custom_models table and
// served (source: 'custom') from list_models; keep costs in sync with the seed.
const BUILTIN_FALLBACK: Model[] = [
  // Aliases (track latest)
  {
    value: 'haiku',
    label: 'Haiku (latest)',
    source: 'builtin',
    color: 'bg-green-500/20 text-green-300',
    input_cost_per_mtok: 1.0,
    output_cost_per_mtok: 5.0,
  },
  {
    value: 'sonnet',
    label: 'Sonnet (latest)',
    source: 'builtin',
    color: 'bg-blue-500/20 text-blue-300',
    input_cost_per_mtok: 3.0,
    output_cost_per_mtok: 15.0,
  },
  {
    value: 'opus',
    label: 'Opus (latest)',
    source: 'builtin',
    color: 'bg-purple-500/20 text-purple-300',
    input_cost_per_mtok: 5.0,
    output_cost_per_mtok: 25.0,
  },
  // Pinned versions
  {
    value: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    source: 'builtin',
    color: 'bg-green-500/20 text-green-300',
    input_cost_per_mtok: 1.0,
    output_cost_per_mtok: 5.0,
  },
  {
    value: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    source: 'builtin',
    color: 'bg-blue-500/20 text-blue-300',
    input_cost_per_mtok: 3.0,
    output_cost_per_mtok: 15.0,
  },
  {
    value: 'claude-opus-4-6',
    label: 'Opus 4.6',
    source: 'builtin',
    color: 'bg-purple-500/20 text-purple-300',
    input_cost_per_mtok: 5.0,
    output_cost_per_mtok: 25.0,
  },
  {
    value: 'claude-opus-4-7',
    label: 'Opus 4.7',
    source: 'builtin',
    color: 'bg-purple-500/20 text-purple-300',
    input_cost_per_mtok: 5.0,
    output_cost_per_mtok: 25.0,
  },
  {
    value: 'claude-opus-4-7[1m]',
    label: 'Opus 4.7 (1M context)',
    source: 'builtin',
    color: 'bg-fuchsia-500/20 text-fuchsia-300',
    input_cost_per_mtok: 5.0,
    output_cost_per_mtok: 25.0,
  },
  {
    value: 'claude-opus-4-8',
    label: 'Opus 4.8',
    source: 'builtin',
    color: 'bg-purple-500/20 text-purple-300',
    input_cost_per_mtok: 5.0,
    output_cost_per_mtok: 25.0,
  },
  {
    value: 'claude-opus-4-8[1m]',
    label: 'Opus 4.8 (1M context)',
    source: 'builtin',
    color: 'bg-fuchsia-500/20 text-fuchsia-300',
    input_cost_per_mtok: 5.0,
    output_cost_per_mtok: 25.0,
  },
  {
    value: 'claude-fable-5',
    label: 'Fable 5',
    source: 'builtin',
    color: 'bg-amber-500/20 text-amber-300',
    input_cost_per_mtok: 10.0,
    output_cost_per_mtok: 50.0,
  },
];

// Module-level cache, shared across all useModels() callers.
let cache: Model[] | null = null;
let inflight: Promise<Model[]> | null = null;
const subscribers = new Set<(models: Model[] | null) => void>();

function notify() {
  for (const fn of subscribers) fn(cache);
}

async function loadOnce(): Promise<Model[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api
    .listModels()
    .then((rows) => {
      cache = Array.isArray(rows) && rows.length > 0 ? rows : BUILTIN_FALLBACK;
      inflight = null;
      notify();
      return cache;
    })
    .catch((e) => {
      console.error('Failed to load models:', e);
      cache = BUILTIN_FALLBACK;
      inflight = null;
      notify();
      return cache;
    });
  return inflight;
}

export function refreshModels(): Promise<Model[]> {
  cache = null;
  inflight = null;
  return loadOnce();
}

export function useModels() {
  const [models, setModels] = useState<Model[]>(() => cache || BUILTIN_FALLBACK);

  useEffect(() => {
    let active = true;
    // Subscribe first so any concurrent load that completes before us still notifies.
    const handler = (next: Model[] | null) => {
      if (active) setModels(next || BUILTIN_FALLBACK);
    };
    subscribers.add(handler);
    // Kick off (or join in-flight) load.
    if (!cache) {
      loadOnce().then((next) => {
        if (active) setModels(next || BUILTIN_FALLBACK);
      });
    } else {
      // Cache was already populated — sync to it.
      setModels(cache);
    }
    return () => {
      active = false;
      subscribers.delete(handler);
    };
  }, []);

  return { models, refresh: refreshModels };
}

// ─── Lookup helpers (do not require hook) ───

export function findModel(modelId: string | null | undefined, models: Model[]): Model | null {
  if (!modelId || !Array.isArray(models)) return null;
  return models.find((m) => m.value === modelId) || null;
}

export function getModelLabel(modelId: string | null | undefined, models: Model[]): string {
  return findModel(modelId, models)?.label || modelId || '—';
}

export function getModelCosts(
  modelId: string | null | undefined,
  models: Model[],
): { input: number; output: number } | null {
  const entry = findModel(modelId, models);
  if (!entry) return null;
  if (entry.input_cost_per_mtok == null && entry.output_cost_per_mtok == null) return null;
  return { input: entry.input_cost_per_mtok ?? 0, output: entry.output_cost_per_mtok ?? 0 };
}

export function getModelColor(modelId: string | null | undefined, models: Model[]): string {
  return findModel(modelId, models)?.color || 'bg-surface-700/50 text-surface-300';
}
