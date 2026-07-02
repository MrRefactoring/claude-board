import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { X, Send, Loader2, Bot, User, Trash2, Sparkles, ListTree } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import { api } from '@/lib/api';
import { IS_TAURI } from '@/lib/tauriEvents';

interface Props {
  projectId: number;
  projectName: string;
  onClose: () => void;
  /** Hand the current input off to the review-first planning flow (Decompose). */
  onDecompose?: (goal: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

export default function ChatSidebar({ projectId, projectName, onClose, onDecompose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading || !IS_TAURI) return;
    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await api.chatSend(projectId, userMessage);
      setMessages((prev) => [...prev, { role: 'assistant', content: response as string }]);
    } catch (e) {
      const detail = (e as Error)?.message || (e as string) || 'Failed to get response';
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${detail}`, isError: true }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Hand the typed goal to the review-first planning flow instead of chatting.
  const handleDecompose = () => {
    if (!onDecompose || loading) return;
    onDecompose(input.trim());
    setInput('');
  };

  const clearChat = () => {
    setMessages([]);
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
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
              title="Clear chat"
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

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-claude/10 flex items-center justify-center flex-shrink-0">
              <Loader2 size={12} className="text-claude animate-spin" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <span>Thinking</span>
              <span className="animate-pulse">...</span>
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
            disabled={loading}
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
            className="flex-1 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-sm text-surface-100 placeholder-surface-500 resize-none focus:outline-none focus:ring-1 focus:ring-claude max-h-24"
            style={{ minHeight: '36px' }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
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
