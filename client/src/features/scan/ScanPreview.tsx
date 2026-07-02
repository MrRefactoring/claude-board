import type { RefObject } from 'react';
import { X, FileText, Plus, Copy, Search, Check, Eye, Pencil } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { MarkdownContent } from '@/features/tasks/MarkdownContent';
import type { ScanPhase, ScanHistoryItem } from './types';

interface ScanPreviewProps {
  phase: ScanPhase;
  result: string;
  setResult: (v: string) => void;
  mode: string;
  setMode: (v: string) => void;
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  searchMatchCount: number;
  highlightedResult: { text: string; highlight: boolean }[] | null;
  wordCount: number;
  viewMode: 'preview' | 'edit';
  setViewMode: (v: 'preview' | 'edit') => void;
  copied: boolean;
  handleCopy: () => void;
  diffMode: boolean;
  viewingHistoryItem: ScanHistoryItem | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export default function ScanPreview({
  phase,
  result,
  setResult,
  mode,
  setMode,
  showSearch,
  setShowSearch,
  searchQuery,
  setSearchQuery,
  searchRef,
  searchMatchCount,
  highlightedResult,
  wordCount,
  viewMode,
  setViewMode,
  copied,
  handleCopy,
  diffMode,
  viewingHistoryItem,
  textareaRef,
}: ScanPreviewProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 bg-surface-800 border border-surface-700 rounded-lg px-3 py-1.5">
          <Search size={12} className="text-surface-500" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('scan.searchPlaceholder')}
            className="flex-1 bg-transparent text-xs text-surface-200 placeholder-surface-600 outline-none"
          />
          {searchQuery && (
            <span className="text-[10px] text-surface-500">
              {searchMatchCount} {searchMatchCount === 1 ? 'match' : 'matches'}
            </span>
          )}
          <button
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            className="p-0.5 rounded hover:bg-surface-700 text-surface-500"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-surface-400">{t('scan.editPreview')}</label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-surface-600">
            {t('scan.wordCount')}: {wordCount}
          </span>
          {/* Preview / Edit toggle */}
          <div className="flex items-center bg-surface-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${viewMode === 'preview' ? 'bg-surface-700 text-surface-200' : 'text-surface-500 hover:text-surface-300'}`}
              title="Markdown Preview"
            >
              <Eye size={10} />
            </button>
            <button
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${viewMode === 'edit' ? 'bg-surface-700 text-surface-200' : 'text-surface-500 hover:text-surface-300'}`}
              title="Edit"
            >
              <Pencil size={10} />
            </button>
          </div>
          <button
            onClick={() => {
              setShowSearch(true);
              setTimeout(() => searchRef.current?.focus(), 50);
            }}
            className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300 transition-colors"
            title={t('scan.search')}
          >
            <Search size={12} />
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300 transition-colors"
            title={t('scan.copyToClipboard')}
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Diff view */}
      {diffMode && viewingHistoryItem?.content ? (
        <div className="grid grid-cols-2 gap-2 max-h-[45vh]">
          <div className="space-y-1">
            <p className="text-[10px] text-surface-500 font-medium">{t('scan.history')} (old)</p>
            <pre className="text-xs text-surface-400 whitespace-pre-wrap bg-surface-800/50 rounded-lg p-3 border border-surface-700/50 leading-relaxed overflow-y-auto h-full max-h-[40vh]">
              {viewingHistoryItem.content}
            </pre>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-surface-500 font-medium">Current</p>
            <div className="bg-surface-800/50 rounded-lg p-3 border border-surface-700/50 overflow-y-auto max-h-[40vh]">
              <MarkdownContent content={result} />
            </div>
          </div>
        </div>
      ) : searchQuery && highlightedResult ? (
        <div className="text-xs text-surface-300 whitespace-pre-wrap bg-surface-800/50 rounded-lg p-4 border border-surface-700/50 leading-relaxed max-h-[50vh] overflow-y-auto">
          {highlightedResult.map((part, i) =>
            part.highlight ? (
              <mark key={i} className="bg-amber-500/30 text-amber-200 rounded px-0.5">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </div>
      ) : viewMode === 'edit' ? (
        <textarea
          ref={textareaRef}
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full text-xs text-surface-300 whitespace-pre-wrap bg-surface-800/50 rounded-lg p-4 border border-surface-700/50 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/30"
          style={{ minHeight: '200px', maxHeight: '50vh' }}
          readOnly={phase === 'saved'}
        />
      ) : (
        <div
          className="bg-surface-800/50 rounded-lg p-4 border border-surface-700/50 overflow-y-auto"
          style={{ minHeight: '200px', maxHeight: '50vh' }}
        >
          <MarkdownContent content={result} />
        </div>
      )}

      {/* Mode selector — only in preview */}
      {phase === 'preview' && (
        <div>
          <label className="text-xs font-medium text-surface-400 mb-1.5 block">{t('scan.writeMode')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('overwrite')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'overwrite' ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30' : 'bg-surface-800 text-surface-500 hover:text-surface-300'}`}
            >
              <FileText size={12} />
              {t('scan.overwrite')}
            </button>
            <button
              onClick={() => setMode('append')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${mode === 'append' ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-surface-800 text-surface-500 hover:text-surface-300'}`}
            >
              <Plus size={12} />
              {t('scan.append')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
