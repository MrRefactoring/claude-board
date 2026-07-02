/**
 * New id order for a column after dragging `activeId` onto `overId`.
 * Returns null when nothing changes (unknown ids or same position).
 */
export function computeReorder(tasks: { id: number }[], activeId: number, overId: number): number[] | null {
  const from = tasks.findIndex((t) => t.id === activeId);
  const to = tasks.findIndex((t) => t.id === overId);
  if (from === -1 || to === -1 || from === to) return null;
  const ids = tasks.map((t) => t.id);
  ids.splice(from, 1);
  ids.splice(to, 0, activeId);
  return ids;
}
