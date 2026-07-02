import { describe, it, expect } from 'vitest';
import { computeReorder } from './reorder';

const tasks = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

describe('computeReorder', () => {
  it('moves a task down past the target', () => {
    expect(computeReorder(tasks, 1, 3)).toEqual([2, 3, 1, 4]);
  });

  it('moves a task up onto the target position', () => {
    expect(computeReorder(tasks, 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it('returns null when dropped on itself', () => {
    expect(computeReorder(tasks, 2, 2)).toBeNull();
  });

  it('returns null for unknown ids', () => {
    expect(computeReorder(tasks, 99, 2)).toBeNull();
    expect(computeReorder(tasks, 1, 99)).toBeNull();
  });
});
