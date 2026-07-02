import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface CrudConfig<T> {
  projectId: number;
  /** Cache key for the list (see lib/queryKeys.ts). */
  queryKey: readonly unknown[];
  getAll: (projectId: number) => Promise<T[]>;
  create: (projectId: number, data: Partial<T>) => Promise<T>;
  update: (id: number, data: Partial<T>) => Promise<T>;
  remove: (id: number) => Promise<void>;
}

/** Generic list+edit+delete state for the entity editor modals, backed by the query cache. */
export function useCrudResource<T extends { id: number }>({
  projectId,
  queryKey,
  getAll,
  create,
  update,
  remove,
}: CrudConfig<T>) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<'new' | T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const { data, isLoading: loading } = useQuery({ queryKey, queryFn: () => getAll(projectId) });
  const items = data ?? [];

  const reload = useCallback(() => queryClient.invalidateQueries({ queryKey }), [queryClient, queryKey]);

  const handleSave = useCallback(
    async (data: Partial<T>) => {
      if (editing === 'new') {
        await create(projectId, data);
      } else if (editing) {
        await update(editing.id, data);
      }
      setEditing(null);
      reload();
    },
    [editing, projectId, create, update, reload],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await remove(id);
      setDeleting(null);
      reload();
    },
    [remove, reload],
  );

  return { items, loading, editing, setEditing, deleting, setDeleting, handleSave, handleDelete, reload };
}
