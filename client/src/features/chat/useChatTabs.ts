import { useState, useEffect, useCallback, useRef } from 'react';

/** A board change the assistant proposes; the user approves it with a button. */
export interface ChatAction {
  action: 'update_task' | 'set_status' | 'set_pr_intent' | 'add_comment';
  task_id: number;
  params?: Record<string, unknown>;
  summary?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  action?: ChatAction;
  actionState?: 'pending' | 'approved' | 'dismissed' | 'error';
  actionError?: string;
}

/** One independent, persisted conversation ("tab") inside the chat sidebar. */
export interface ChatTab {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string | null;
  createdAt: number;
}

const DEFAULT_TITLE = 'New chat';

const storageKey = (projectId: number) => `chat:tabs:${projectId}`;

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function freshTab(): ChatTab {
  return { id: makeId(), title: DEFAULT_TITLE, messages: [], model: null, createdAt: Date.now() };
}

interface Persisted {
  tabs: ChatTab[];
  activeId: string;
}

function load(projectId: number): Persisted {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      const first = parsed && Array.isArray(parsed.tabs) ? parsed.tabs[0] : undefined;
      if (first) {
        const activeId = parsed.tabs.some((t) => t.id === parsed.activeId) ? parsed.activeId : first.id;
        return { tabs: parsed.tabs, activeId };
      }
    }
  } catch {
    /* corrupt/unavailable — start fresh */
  }
  const t = freshTab();
  return { tabs: [t], activeId: t.id };
}

/** Derive a tab title from its first user message while still on the default. */
function titleFor(tab: ChatTab, messages: ChatMessage[]): string {
  if (tab.title !== DEFAULT_TITLE) return tab.title;
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
  return firstUser ? firstUser.content.trim().replace(/\s+/g, ' ').slice(0, 40) : tab.title;
}

/**
 * Multi-tab chat state, persisted per project in localStorage. History survives
 * closing the panel and reloading the board; it is only removed when the user
 * clears a tab or closes it. Message mutations target a tab *by id* so an
 * in-flight run's response still lands in the right place after a tab switch.
 */
export function useChatTabs(projectId: number) {
  const [state, setState] = useState<Persisted>(() => load(projectId));

  // Reload when the active project changes (same component instance is reused).
  const pidRef = useRef(projectId);
  useEffect(() => {
    if (pidRef.current !== projectId) {
      pidRef.current = projectId;
      setState(load(projectId));
    }
  }, [projectId]);

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify(state));
    } catch {
      /* quota / unavailable — non-fatal */
    }
  }, [projectId, state]);

  const activeTab = state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0] ?? freshTab();

  const selectTab = useCallback((id: string) => {
    setState((s) => (s.tabs.some((t) => t.id === id) ? { ...s, activeId: id } : s));
  }, []);

  const addTab = useCallback(() => {
    setState((s) => {
      const t = freshTab();
      return { tabs: [...s.tabs, t], activeId: t.id };
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setState((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id);
      const last = remaining[remaining.length - 1];
      if (!last) {
        const t = freshTab();
        return { tabs: [t], activeId: t.id };
      }
      const activeId = s.activeId === id ? last.id : s.activeId;
      return { tabs: remaining, activeId };
    });
  }, []);

  /** Mutate a specific tab's messages by id (safe across tab switches mid-run). */
  const updateTabMessages = useCallback(
    (tabId: string, updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
      setState((s) => ({
        ...s,
        tabs: s.tabs.map((t) => {
          if (t.id !== tabId) return t;
          const messages = updater(t.messages);
          return { ...t, title: titleFor(t, messages), messages };
        }),
      }));
    },
    [],
  );

  const clearTab = useCallback((tabId: string) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title: DEFAULT_TITLE, messages: [] } : t)),
    }));
  }, []);

  return {
    tabs: state.tabs,
    activeId: state.activeId,
    activeTab,
    selectTab,
    addTab,
    closeTab,
    updateTabMessages,
    clearTab,
  };
}
