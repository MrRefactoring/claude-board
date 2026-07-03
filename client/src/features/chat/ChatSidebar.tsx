import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { X, Send, Loader2, Bot, User, Trash2, Sparkles, ListTree, Check, Ban, CheckCircle2, Zap, ShieldQuestion, Wrench, Plus } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { api } from '@/lib/api';
import type { TaskStatus, PendingPermission } from '@/lib/types';
import { IS_TAURI, tauriListen } from '@/lib/tauriEvents';
import { useChatTabs } from './useChatTabs';
import type { ChatAction } from './useChatTabs';

/** A compact activity line streamed from the backend during a chat run. */
interface Activity {
  kind: string;
  label: string;
}

/** Pull a telling field out of a pending tool's input to show on the approval card. */
function permDetail(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  for (const k of ['title', 'query', 'command', 'body', 'path', 'file_path', 'url', 'pattern']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 140);
  }
  return null;
}

interface Props {
  projectId: number;
  projectName: string;
  onClose: () => void;
  /** Hand the current input off to the review-first planning flow (Decompose). */
  onDecompose?: (goal: string) => void;
}

const ACTION_TYPES = new Set(['update_task', 'set_status', 'set_pr_intent', 'add_comment']);

/** Pull a `board:action` (or json) proposal block out of the assistant reply and
 *  return the text without it. Tolerant: accepts any fenced block that parses to
 *  an object with a known `action` and a numeric `task_id`. */
function parseAction(content: string): { text: string; action?: ChatAction } {
  const fence = /```(?:board:action|json)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    const body = m[1];
    if (body === undefined) continue;
    try {
      const obj = JSON.parse(body.trim());
      if (obj && typeof obj === 'object' && ACTION_TYPES.has(obj.action) && typeof obj.task_id === 'number') {
        const text = (content.slice(0, m.index) + content.slice(m.index + m[0].length)).trim();
        return { text, action: obj as ChatAction };
      }
    } catch {
      /* not our block — keep scanning */
    }
  }
  return { text: content };
}

const ACTION_LABELS: Record<ChatAction['action'], string> = {
  update_task: 'Edit task',
  set_status: 'Change status',
  set_pr_intent: 'PR intent',
  add_comment: 'Add comment',
};

export default function ChatSidebar({ projectId, projectName, onClose, onDecompose }: Props) {
  // Multiple persisted conversations, one active at a time (Cursor-style tabs).
  const { tabs, activeId, activeTab, selectTab, addTab, closeTab, updateTabMessages, clearTab } =
    useChatTabs(projectId);
  const messages = activeTab.messages;

  const [input, setInput] = useState('');
  // The tab whose run is currently in flight (null when idle). One run at a time.
  const [runningTabId, setRunningTabId] = useState<string | null>(null);
  const busy = runningTabId !== null;
  const showRun = runningTabId === activeId;
  // Full-autonomy toggle (persisted app-wide) + live tool-permission requests.
  const [bypass, setBypass] = useState(false);
  const [pending, setPending] = useState<PendingPermission[]>([]);
  // Compact live activity log for the current run (tool calls, thinking).
  const [activity, setActivity] = useState<Activity[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load the persisted bypass flag on mount.
  useEffect(() => {
    api
      .getAppSettings()
      .then((s) => {
        const v = (s as { chat_bypass_permissions?: boolean })?.chat_bypass_permissions;
        if (typeof v === 'boolean') setBypass(v);
      })
      .catch(() => {});
  }, []);

  // While a chat run is active, poll for tool-permission requests Claude raised
  // (origin === 'chat') so we can show a Yes / Always / Deny card.
  useEffect(() => {
    if (!busy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate clear of the permission-card list when the chat run ends
      setPending([]);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const all = await api.getPendingPermissions();
        if (alive) setPending(all.filter((p) => p.origin === 'chat'));
      } catch {
        /* transient — try again next tick */
      }
    };
    void tick();
    const iv = setInterval(tick, 800);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [busy]);

  // Live activity log streamed by chat_send while a run is in flight.
  useEffect(() => tauriListen('chat:activity', (p) => setActivity((prev) => [...prev.slice(-199), p])), []);

  const toggleBypass = async () => {
    const next = !bypass;
    setBypass(next);
    try {
      await api.updateAppSettings({ chat_bypass_permissions: next });
    } catch {
      setBypass(!next); // revert on failure
    }
  };

  const resolvePermission = async (id: string, decision: 'allow' | 'deny', remember = false) => {
    setPending((prev) => prev.filter((p) => p.id !== id)); // optimistic
    try {
      await api.resolvePermission(id, decision, remember);
    } catch {
      /* the poll will re-surface it if the resolve didn't land */
    }
  };

  // Scroll to the newest message when the active tab's thread changes.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeId]);

  // Auto-grow the input to fit its content, up to a cap (then it scrolls).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || busy || !IS_TAURI) return;
    const tabId = activeId; // capture — the run's response must land in THIS tab
    const userMessage = input.trim();
    // Snapshot the prior turns (before appending this one) as conversation context.
    const history = activeTab.messages
      .filter((m) => !m.isError && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    setInput('');
    updateTabMessages(tabId, (prev) => [...prev, { role: 'user', content: userMessage }]);
    setActivity([]);
    setRunningTabId(tabId);

    try {
      const response = await api.chatSend(projectId, userMessage, activeTab.model ?? undefined, history);
      const { text, action } = parseAction(response as string);
      updateTabMessages(tabId, (prev) => [
        ...prev,
        { role: 'assistant', content: text, action, actionState: action ? 'pending' : undefined },
      ]);
    } catch (e) {
      const detail = (e as Error)?.message || (e as string) || 'Failed to get response';
      updateTabMessages(tabId, (prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${detail}`, isError: true },
      ]);
    } finally {
      setRunningTabId(null);
      inputRef.current?.focus();
    }
  };

  // Execute an approved board action deterministically via the existing APIs —
  // no second LLM round-trip. The board refreshes from the emitted events.
  const runAction = async (idx: number, a: ChatAction) => {
    updateTabMessages(activeId, (prev) =>
      prev.map((msg, i) => (i === idx ? { ...msg, actionState: 'approved' } : msg)),
    );
    try {
      const p = a.params || {};
      if (a.action === 'update_task') {
        await api.updateTask(a.task_id, p);
      } else if (a.action === 'set_status') {
        await api.updateStatus(a.task_id, String(p.status) as TaskStatus);
      } else if (a.action === 'set_pr_intent') {
        await api.setTaskAutoPr(a.task_id, (p.enabled ?? null) as boolean | null);
      } else if (a.action === 'add_comment') {
        await api.addTaskComment(a.task_id, String(p.body ?? ''));
      }
    } catch (e) {
      const detail = (e as Error)?.message || 'Failed to apply';
      updateTabMessages(activeId, (prev) =>
        prev.map((msg, i) => (i === idx ? { ...msg, actionState: 'error', actionError: detail } : msg)),
      );
    }
  };

  const dismissAction = (idx: number) => {
    updateTabMessages(activeId, (prev) =>
      prev.map((msg, i) => (i === idx ? { ...msg, actionState: 'dismissed' } : msg)),
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Hand the typed goal to the review-first planning flow instead of chatting.
  const handleDecompose = () => {
    if (!onDecompose || busy) return;
    onDecompose(input.trim());
    setInput('');
  };

  if (!IS_TAURI) return null;

  return (
    <div className="w-[360px] flex-shrink-0 border-l border-surface-800 flex flex-col bg-surface-900 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-claude/10 flex items-center justify-center">
            <Sparkles size={14} className="text-claude" />
          </div>
          <div>
            <h3 className="text-sm font-medium">AI Assistant</h3>
            <p className="text-[10px] text-surface-500">{projectName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleBypass}
            title={
              bypass
                ? 'Full autonomy: tools run without asking (--dangerously-skip-permissions)'
                : 'Ask before each new tool (Yes / Always / Deny)'
            }
            className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              bypass
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800'
            }`}
          >
            <Zap size={12} /> {bypass ? 'Auto' : 'Ask'}
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => clearTab(activeId)}
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
              title="Clear this chat"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs — one independent, persisted conversation each */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-surface-800 flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            title={tab.title}
            className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-md text-[11px] cursor-pointer flex-shrink-0 max-w-[150px] transition-colors ${
              tab.id === activeId
                ? 'bg-surface-800 text-surface-100'
                : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/50'
            }`}
          >
            {tab.id === runningTabId ? (
              <Loader2 size={10} className="text-claude animate-spin flex-shrink-0" />
            ) : null}
            <span className="truncate">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-700 flex-shrink-0 transition-opacity"
              title="Close tab"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          onClick={addTab}
          className="p-1 rounded-md text-surface-500 hover:text-surface-200 hover:bg-surface-800 flex-shrink-0"
          title="New chat"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-claude/10 flex items-center justify-center mb-4">
              <Sparkles size={22} className="text-claude" />
            </div>
            <h4 className="text-sm font-medium text-surface-300 mb-2">Plan and manage with AI</h4>
            <p className="text-xs text-surface-500 mb-4 leading-relaxed">
              Summarize progress, rewrite task descriptions, or describe a goal and click{' '}
              <span className="text-claude">Decompose into tasks</span> to get a reviewable breakdown.
            </p>
            <div className="space-y-1.5 w-full">
              {[
                'Summarize the current project status',
                'Rewrite the description of a task to be clearer',
                'Which tasks are blocking progress?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-surface-400 bg-surface-800/50 hover:bg-surface-800 hover:text-surface-200 rounded-lg transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? '' : ''}`}>
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === 'user' ? 'bg-surface-700' : 'bg-claude/10'
              }`}
            >
              {msg.role === 'user' ? (
                <User size={12} className="text-surface-300" />
              ) : (
                <Bot size={12} className="text-claude" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {msg.role === 'assistant' && !msg.isError ? (
                <>
                  {msg.content && (
                    <div data-color-mode="dark" className="chat-md-content">
                      <MDEditor.Markdown
                        source={msg.content}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#d4cbbe',
                          fontSize: '13px',
                          lineHeight: '1.6',
                        }}
                      />
                    </div>
                  )}
                  {msg.action && (
                    <div
                      className={`mt-2 rounded-lg border px-3 py-2.5 ${
                        msg.actionState === 'approved'
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : msg.actionState === 'dismissed'
                            ? 'border-surface-700/50 bg-surface-800/30 opacity-70'
                            : msg.actionState === 'error'
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-claude/30 bg-claude/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">
                          {ACTION_LABELS[msg.action.action]}
                        </span>
                        <span className="text-[10px] text-surface-600 font-mono">#{msg.action.task_id}</span>
                      </div>
                      <p className="text-xs text-surface-200 leading-snug">
                        {msg.action.summary || ACTION_LABELS[msg.action.action]}
                      </p>
                      {msg.actionState === 'error' && msg.actionError && (
                        <p className="text-[11px] text-red-400 mt-1">{msg.actionError}</p>
                      )}
                      {(msg.actionState === 'pending' || msg.actionState === 'error') && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => runAction(i, msg.action!)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-claude hover:bg-claude-light text-white text-[11px] font-medium transition-colors"
                          >
                            <Check size={12} /> {msg.actionState === 'error' ? 'Retry' : 'Approve'}
                          </button>
                          <button
                            onClick={() => dismissAction(i)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-800 text-[11px] font-medium transition-colors"
                          >
                            <Ban size={12} /> Dismiss
                          </button>
                        </div>
                      )}
                      {msg.actionState === 'approved' && (
                        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-emerald-400 font-medium">
                          <CheckCircle2 size={12} /> Applied
                        </div>
                      )}
                      {msg.actionState === 'dismissed' && (
                        <div className="text-[11px] text-surface-500 mt-1.5">Dismissed</div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    msg.isError ? 'text-red-400' : 'text-surface-200'
                  }`}
                >
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Tool-permission requests raised during this tab's run */}
        {showRun &&
          pending.map((p) => (
            <div key={p.id} className="flex gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldQuestion size={12} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 mb-1">
                  Tool permission
                </div>
                <p className="text-xs text-surface-200 leading-snug">
                  Claude wants to use{' '}
                  <span className="font-mono text-amber-200 break-all">
                    {p.tool_name.replace(/^mcp__claude-board__/, '')}
                  </span>
                  .
                </p>
                {permDetail(p.input) && (
                  <p className="text-[11px] text-surface-400 mt-0.5 break-words leading-snug">{permDetail(p.input)}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    onClick={() => resolvePermission(p.id, 'allow')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors"
                  >
                    <Check size={12} /> Yes
                  </button>
                  <button
                    onClick={() => resolvePermission(p.id, 'allow', true)}
                    title="Allow this tool for the rest of the session"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-medium transition-colors"
                  >
                    <CheckCircle2 size={12} /> Always
                  </button>
                  <button
                    onClick={() => resolvePermission(p.id, 'deny')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-800 text-[11px] font-medium transition-colors"
                  >
                    <Ban size={12} /> Deny
                  </button>
                </div>
              </div>
            </div>
          ))}

        {showRun && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-claude/10 flex items-center justify-center flex-shrink-0">
              <Loader2 size={12} className="text-claude animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-surface-500">
                <span>Working</span>
                <span className="animate-pulse">...</span>
              </div>
              {activity.filter((a) => a.kind !== 'tool_result').length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {activity
                    .filter((a) => a.kind !== 'tool_result')
                    .slice(-8)
                    .map((a, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] text-surface-500">
                        {a.kind === 'tool' ? (
                          <Wrench size={9} className="text-claude/70 flex-shrink-0" />
                        ) : (
                          <span className="text-surface-600 flex-shrink-0">·</span>
                        )}
                        <span className="truncate font-mono">{a.label}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-surface-800 p-3 flex-shrink-0">
        {onDecompose && (
          <button
            onClick={handleDecompose}
            disabled={busy}
            title="Break the goal in the box into epics, stories and tasks — you review before anything is created"
            className="w-full mb-2 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-claude bg-claude/10 hover:bg-claude/20 disabled:opacity-40 rounded-lg transition-colors"
          >
            <ListTree size={13} />
            Decompose into tasks
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your project..."
            rows={1}
            className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-surface-100 placeholder-surface-500 resize-none focus:outline-none focus:ring-1 focus:ring-claude max-h-48 overflow-y-auto"
            style={{ minHeight: '36px' }}
            disabled={busy}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || busy}
            className="p-2 rounded-lg bg-claude hover:bg-claude-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
        <p className="text-[9px] text-surface-600 mt-1.5 text-center">Powered by Claude CLI &middot; Enter to send</p>
      </div>
    </div>
  );
}
