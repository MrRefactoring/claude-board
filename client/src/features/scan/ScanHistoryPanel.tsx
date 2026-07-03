import { Loader2, Trash2, FileText, History } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { ScanPhase, ScanHistoryItem } from './types';

interface ScanHistoryPanelProps {
  history: ScanHistoryItem[];
  historyLoading: boolean;
  viewingHistoryItem: ScanHistoryItem | null;
  diffMode: boolean;
  result: string;
  phase: ScanPhase;
  handleViewHistoryItem: (item: ScanHistoryItem) => void;
  handleCompare: () => void;
  handleDeleteScan: (id: number) => void;
}

export default function ScanHistoryPanel({
  history,
  historyLoading,
  viewingHistoryItem,
  diffMode,
  result,
  phase,
  handleViewHistoryItem,
  handleCompare,
  handleDeleteScan,
}: ScanHistoryPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-surface-800 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-surface-400 flex items-center gap-1.5">
          <History size={12} />
          {t('scan.history')}
          {history.length > 0 && <span className="text-[10px] text-surface-600">({history.length})</span>}
        </h3>
      </div>
      {historyLoading ? (
        <div className="flex items-center gap-2 text-xs text-surface-500 py-3 justify-center">
          <Loader2 size={12} className="animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-xs text-surface-600 py-3 text-center">{t('scan.noHistory')}</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {history.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                viewingHistoryItem?.id === item.id
                  ? 'bg-blue-500/10 border border-blue-500/20'
                  : 'bg-surface-800/50 hover:bg-surface-800 border border-transparent'
              }`}
              onClick={() => handleViewHistoryItem(item)}
            >
              <div className="flex-1 min-w-0">
                <span className="text-surface-300">
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : item.date || 'Unknown'}
                </span>
                {item.scanType && <span className="ml-2 text-surface-500">- {item.scanType}</span>}
                {item.fileCount != null && <span className="ml-1 text-surface-600">({item.fileCount} files)</span>}
              </div>
              <div className="flex items-center gap-1">
                {result && viewingHistoryItem?.id === item.id && viewingHistoryItem.content && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompare();
                    }}
                    className={`p-1 rounded hover:bg-surface-700 transition-colors ${diffMode ? 'text-blue-400' : 'text-surface-500'}`}
                    title="Compare"
                  >
                    <FileText size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteScan(item.id);
                  }}
                  className="p-1 rounded hover:bg-red-500/20 text-surface-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewing history item content (not in diff mode) */}
      {viewingHistoryItem?.content && !diffMode && !(phase === 'preview' || phase === 'saved') && (
        <pre className="text-xs text-surface-400 whitespace-pre-wrap bg-surface-800/30 rounded-lg p-3 border border-surface-700/30 leading-relaxed max-h-48 overflow-y-auto mt-2">
          {viewingHistoryItem.content}
        </pre>
      )}
    </div>
  );
}
