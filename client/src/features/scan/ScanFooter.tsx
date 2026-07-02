import { ScanSearch, Loader2, CheckCircle2, Save, Trash2, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { ScanPhase } from './types';

interface ScanFooterProps {
  phase: ScanPhase;
  isScanning: boolean;
  scanType: string;
  customPrompt: string;
  saving: boolean;
  onClose: () => void;
  handleStart: () => void;
  handleCancel: () => void;
  handleDiscard: () => void;
  handleRescan: () => void;
  handleSave: () => void;
}

export default function ScanFooter({
  phase,
  isScanning,
  scanType,
  customPrompt,
  saving,
  onClose,
  handleStart,
  handleCancel,
  handleDiscard,
  handleRescan,
  handleSave,
}: ScanFooterProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 px-5 py-3 border-t border-surface-800 flex-shrink-0">
      {phase === 'idle' && (
        <>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleStart}
            disabled={scanType === 'custom' && !customPrompt.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <ScanSearch size={14} /> {t('scan.startScan')}
          </button>
        </>
      )}
      {isScanning && (
        <button
          onClick={handleCancel}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
        >
          {t('scan.cancel')}
        </button>
      )}
      {phase === 'preview' && (
        <>
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
          >
            <Trash2 size={14} /> {t('scan.discard')}
          </button>
          <button
            onClick={handleRescan}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> {t('scan.rescan')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? t('common.saving') : t('scan.saveToClaudeMd')}
          </button>
        </>
      )}
      {phase === 'saved' && (
        <>
          <button
            onClick={handleRescan}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> {t('scan.rescan')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
          >
            <CheckCircle2 size={14} /> {t('common.close')}
          </button>
        </>
      )}
      {phase === 'error' && (
        <>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-surface-300 bg-surface-800 hover:bg-surface-700 rounded-lg transition-colors"
          >
            {t('common.close')}
          </button>
          <button
            onClick={handleStart}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> {t('scan.retry')}
          </button>
        </>
      )}
    </div>
  );
}
