import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from './uiStore';

const initial = useUIStore.getState();

beforeEach(() => {
  useUIStore.setState(initial, true);
  sessionStorage.clear();
});

describe('uiStore modals', () => {
  it('opens with the sentinel true by default and closes back to undefined', () => {
    useUIStore.getState().openModal('task');
    expect(useUIStore.getState().modals.task).toBe(true);
    useUIStore.getState().closeModal('task');
    expect(useUIStore.getState().modals.task).toBeUndefined();
  });

  it('carries an entity payload', () => {
    const task = { id: 1, title: 'x' };
    useUIStore.getState().openModal('detail', task);
    expect(useUIStore.getState().modals.detail).toBe(task);
  });

  it('planning mirrors into sessionStorage', () => {
    useUIStore.getState().openPlanning();
    expect(sessionStorage.getItem('planning:active')).toBe('true');
    expect(useUIStore.getState().modals.planning).toBe(true);
    useUIStore.getState().closePlanning();
    expect(sessionStorage.getItem('planning:active')).toBeNull();
    expect(useUIStore.getState().modals.planning).toBeUndefined();
  });
});

describe('uiStore panels', () => {
  it('togglePanel switches the same panel off and replaces a different one', () => {
    useUIStore.getState().togglePanel('stats');
    expect(useUIStore.getState().activePanel).toBe('stats');
    useUIStore.getState().togglePanel('activity');
    expect(useUIStore.getState().activePanel).toBe('activity');
    useUIStore.getState().togglePanel('activity');
    expect(useUIStore.getState().activePanel).toBeNull();
  });
});

describe('uiStore confirm', () => {
  it('sets and clears the confirm dialog', () => {
    const confirm = { title: 't', message: 'm', onConfirm: () => {} };
    useUIStore.getState().setConfirm(confirm);
    expect(useUIStore.getState().confirm).toBe(confirm);
    useUIStore.getState().setConfirm(null);
    expect(useUIStore.getState().confirm).toBeNull();
  });
});

describe('uiStore toasts', () => {
  it('adds a toast and auto-removes it after the timeout', () => {
    vi.useFakeTimers();
    useUIStore.getState().addToast('hello', 'success');
    expect(useUIStore.getState().toasts).toHaveLength(1);
    expect(useUIStore.getState().toasts[0]).toMatchObject({ message: 'hello', type: 'success' });
    vi.runAllTimers();
    expect(useUIStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('uiStore project navigation', () => {
  it('navigateToProject stores the id and pushes the slug', () => {
    const push = vi.spyOn(window.history, 'pushState');
    useUIStore.getState().navigateToProject({ id: 7, slug: 'seven', name: 'Seven' } as never);
    expect(useUIStore.getState().currentProjectId).toBe(7);
    expect(push).toHaveBeenCalledWith({ slug: 'seven' }, '', '/seven');
    push.mockRestore();
  });

  it('navigateToDashboard clears the id and pushes root', () => {
    const push = vi.spyOn(window.history, 'pushState');
    useUIStore.getState().setCurrentProjectId(3);
    useUIStore.getState().navigateToDashboard();
    expect(useUIStore.getState().currentProjectId).toBeNull();
    expect(push).toHaveBeenCalledWith({}, '', '/');
    push.mockRestore();
  });

  it('setCurrentProjectId does not touch history', () => {
    const push = vi.spyOn(window.history, 'pushState');
    useUIStore.getState().setCurrentProjectId(5);
    expect(useUIStore.getState().currentProjectId).toBe(5);
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });
});
