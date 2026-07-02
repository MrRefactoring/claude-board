import { useState, useEffect } from 'react';
import { Send, ExternalLink, Bot, User } from 'lucide-react';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { formatTimeAgo } from '@/lib/formatters';
import { MarkdownContent } from '@/features/tasks/MarkdownContent';
import type { TaskComment } from '@/lib/types';

/** Task work-log: comments from the user and from agents (with optional PR links). */
export function TaskCommentsTab({ taskId }: { taskId: number }) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getTaskComments(taskId)
      .then((c) => {
        if (active) setComments(c);
      })
      .catch(() => {});

    const onCreated = (payload: { taskId: number; comment: TaskComment }) => {
      if (payload?.taskId !== taskId) return;
      setComments((prev) => (prev.some((c) => c.id === payload.comment.id) ? prev : [...prev, payload.comment]));
    };
    socket.on('comment:created', onCreated);
    return () => {
      active = false;
      socket.off('comment:created', onCreated);
    };
  }, [taskId]);

  const handleAdd = async () => {
    const body = input.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const created = await api.addTaskComment(taskId, body);
      setComments((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
      setInput('');
    } catch {
      /* errors are surfaced via the global notifier */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {comments.length === 0 && <div className="text-center text-surface-600 text-xs py-6">No comments yet.</div>}

      <div className="space-y-2.5">
        {comments.map((c) => {
          const isAgent = c.author_type === 'agent';
          return (
            <div key={c.id} className="bg-surface-800/30 border border-surface-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center ${
                    isAgent ? 'bg-claude/10' : 'bg-surface-700'
                  }`}
                >
                  {isAgent ? <Bot size={11} className="text-claude" /> : <User size={11} className="text-surface-300" />}
                </div>
                <span className="text-[11px] font-medium text-surface-300">
                  {c.author_name || (isAgent ? 'Agent' : 'You')}
                </span>
                {c.created_at && <span className="text-[10px] text-surface-600">{formatTimeAgo(c.created_at)}</span>}
              </div>
              <div className="text-surface-300 text-xs leading-relaxed">
                <MarkdownContent content={c.body} />
              </div>
              {c.pr_url && (
                <a
                  href={c.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-claude hover:underline"
                >
                  <ExternalLink size={11} /> View pull request
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-end gap-2 pt-1">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a comment… (⌘/Ctrl+Enter)"
          rows={2}
          className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-xs text-surface-100 placeholder-surface-500 resize-none focus:outline-none focus:ring-1 focus:ring-claude"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim() || saving}
          className="p-2 rounded-lg bg-claude hover:bg-claude-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <Send size={13} className="text-white" />
        </button>
      </div>
    </div>
  );
}
