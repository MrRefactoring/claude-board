import { ScanSearch, Clock, Loader2, FileText, AlertTriangle, Zap, SearchCode, Radio, Blocks, PenLine } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Prescan } from './types';

function estimateTime(fileCount: number) {
  if (fileCount <= 100) return '~30s';
  if (fileCount <= 500) return '~1 min';
  if (fileCount <= 2000) return '~2 min';
  if (fileCount <= 5000) return '~3 min';
  return '~5+ min';
}

const SCAN_TYPES = [
  { key: 'quick', Icon: Zap },
  { key: 'detailed', Icon: SearchCode },
  { key: 'apiDocs', Icon: Radio },
  { key: 'architecture', Icon: Blocks },
  { key: 'custom', Icon: PenLine },
];

interface ScanIdleViewProps {
  scanType: string;
  setScanType: (v: string) => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  prescan: Prescan | null;
  prescanLoading: boolean;
  isLargeCodebase: boolean;
}

export default function ScanIdleView({
  scanType,
  setScanType,
  customPrompt,
  setCustomPrompt,
  prescan,
  prescanLoading,
  isLargeCodebase,
}: ScanIdleViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {SCAN_TYPES.map(({ key, Icon }) => (
          <button
            key={key}
            onClick={() => setScanType(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              scanType === key
                ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
                : 'bg-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-700'
            }`}
          >
            <Icon size={13} />
            {t(`scan.${key}`)}
          </button>
        ))}
      </div>

      {/* Custom prompt textarea */}
      {scanType === 'custom' && (
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder={t('scan.customPromptPlaceholder')}
          className="w-full h-24 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-surface-200 placeholder-surface-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
      )}

      {/* Pre-scan stats */}
      {prescanLoading ? (
        <div className="flex items-center gap-2 text-xs text-surface-500 py-2">
          <Loader2 size={12} className="animate-spin" />
          {t('scan.collectingStats')}
        </div>
      ) : prescan ? (
        <div className="bg-surface-800/50 border border-surface-700/50 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-surface-300">
              <FileText size={12} className="text-blue-400" />
              {prescan.fileCount != null ? t('scan.filesDetected', { count: prescan.fileCount }) : t('scan.prescanInfo')}
            </span>
            {prescan.projectTypes && prescan.projectTypes.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {prescan.projectTypes.map((type) => (
                  <span key={type} className="px-1.5 py-0.5 rounded bg-surface-700 text-surface-300 text-[10px] font-medium">
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
          {prescan.fileCount != null && (
            <div className="flex items-center gap-1.5 text-[11px] text-surface-500">
              <Clock size={10} />
              {t('scan.estimatedTime')}: {estimateTime(prescan.fileCount)}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <ScanSearch size={28} className="text-blue-400" />
          </div>
          <div className="text-center">
            <p className="text-sm text-surface-200 font-medium">{t('scan.idleTitle')}</p>
            <p className="text-xs text-surface-500 mt-1 max-w-sm">{t('scan.idleDesc')}</p>
          </div>
        </div>
      )}

      {/* Large codebase warning */}
      {isLargeCodebase && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-400 font-medium">
              {t('scan.largeCodebaseWarning', { count: prescan?.fileCount ?? 0 })}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
