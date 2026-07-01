import { useState, useEffect, useCallback } from 'react';

interface CrudConfig<T> {
  projectId: number;
  getAll: (projectId: number) => Promise<T[]>;
  create: (projectId: number, data: Partial<T>) => Promise<T>;
  update: (id: number, data: Partial<T>) => Promise<T>;
  remove: (id: number) => Promise<void>;
}

export function useCrudResource<T extends { id: number }>({
  projectId,
  getAll,
  create,
  update,
  remove,
}: CrudConfig<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<'new' | T | null>(null); // null | 'new' | item object
  const [deleting, setDeleting] = useState<T | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await getAll(projectId);
      setItems(data);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [projectId, getAll]);

  useEffect(() => {
    reload();
  }, [reload]);

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
