import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, ScanSearch, Clock, Loader2, AlertCircle, History } from 'lucide-react';
import { api } from '@/lib/api';
import { tauriListen } from '@/lib/tauriEvents';
import type { AppEventMap } from '@/lib/events';
import { useTranslation } from '@/i18n/I18nProvider';
import type { ScanPhase, Prescan, ScanHistoryItem } from './types';
import ScanIdleView from './ScanIdleView';
import ScanPreview from './ScanPreview';
import ScanHistoryPanel from './ScanHistoryPanel';
import ScanFooter from './ScanFooter';

type ScanResult = string | { content?: string };

interface ScanCacheEntry {
  phase: ScanPhase;
  result: string;
  error: string | null;
  elapsed: number;
}

interface ScanEvent {
  projectId?: number;
  fileCount?: number;
  projectTypes?: string[];
  message?: string;
  phase?: string;
  result?: ScanResult;
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// Module-level cache — survives open/close
const scanCache: Record<number, ScanCacheEntry> = {};
function getCache(pid: number): ScanCacheEntry {
  if (!scanCache[pid]) scanCache[pid] = { phase: 'idle', result: '', error: null, elapsed: 0 };
  return scanCache[pid];
}

interface ScanModalProps {
  projectId: number;
  onClose: () => void;
}

export default function ScanModal({ projectId, onClose }: ScanModalProps) {
  const { t } = useTranslation();
  const c = getCache(projectId);
  const [phase, setPhase] = useState<ScanPhase>(c.phase); // idle | scanning | preview | saved | error
  const [result, setResult] = useState(c.result);
  const [error, setError] = useState<string | null>(c.error);
  const [elapsed, setElapsed] = useState(c.elapsed);
  const [mode, setMode] = useState('overwrite');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startRef = useRef<number | null>(null);

  // Scan type
  const [scanType, setScanType] = useState('detailed');
  const [customPrompt, setCustomPrompt] = useState('');

  // Pre-scan stats
  const [prescan, setPrescan] = useState<Prescan | null>(null);
  const [prescanLoading, setPrescanLoading] = useState(false);

  // Progress phase text
  const [progressText, setProgressText] = useState('');

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Copy
  const [copied, setCopied] = useState(false);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<ScanHistoryItem | null>(null);
  const [diffMode, setDiffMode] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview'); // 'preview' | 'edit'

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync cache
  useEffect(() => {
    Object.assign(getCache(projectId), { phase, result, error, elapsed });
  });

  // Timer
  useEffect(() => {
    if (phase === 'scanning') {
      const start = startRef.current || Date.now() - (elapsed || 0);
      startRef.current = start;
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - start);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Load pre-scan stats on mount
  useEffect(() => {
    if (phase !== 'idle') return;
    setPrescanLoading(true);
    (api.prescanStats ? api.prescanStats(projectId) : Promise.resolve(null))
      .then((data) => {
        if (data) setPrescan(data as Prescan);
      })
      .catch(() => {})
      .finally(() => setPrescanLoading(false));
  }, [projectId, phase]);

  // Listen for scan events (scan:* events are emitted by the desktop shell but are not part of AppEventMap)
  useEffect(() => {
    const listen = (name: string, cb: (data: ScanEvent) => void) =>
      tauriListen(name as keyof AppEventMap, (payload) => cb(payload as unknown as ScanEvent));
    const unsubs = [
      listen('scan:started', (data) => {
        if (data.projectId !== projectId) return;
        setProgressText(t('scan.analyzing'));
      }),
      listen('scan:stats', (data) => {
        if (data.projectId !== projectId) return;
        setPrescan((prev) => ({
          ...prev,
          fileCount: data.fileCount,
          projectTypes: data.projectTypes || prev?.projectTypes,
        }));
      }),
      listen('scan:progress', (data) => {
        if (data.projectId !== projectId) return;
        setProgressText(data.message || data.phase || '');
      }),
      listen('scan:completed', (data) => {
        if (data.projectId !== projectId) return;
        clearInterval(timerRef.current);
        const r = data.result;
        if (r) {
          setResult(typeof r === 'string' ? r : r.content || JSON.stringify(r, null, 2));
          setPhase('preview');
          setProgressText('');
        }
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [projectId, t]);

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && (phase === 'preview' || phase === 'saved')) {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, showSearch]);

  const handleStart = async () => {
    setPhase('scanning');
    setResult('');
    setError(null);
    setElapsed(0);
    setProgressText(t('scan.collectingStats'));
    startRef.current = Date.now();
    setViewingHistoryItem(null);
    setDiffMode(false);
    try {
      const res = (await api.scanCodebase(
        projectId,
        scanType,
        scanType === 'custom' ? customPrompt : null,
      )) as ScanResult;
      clearInterval(timerRef.current);
      setResult(typeof res === 'string' ? res : res?.content || JSON.stringify(res, null, 2));
      setPhase('preview');
      setProgressText('');
    } catch (e) {
      clearInterval(timerRef.current);
      setError((e as Error).message);
      setPhase('error');
      setProgressText('');
    }
  };

  const handleCancel = async () => {
    clearInterval(timerRef.current);
    setPhase('idle');
    setProgressText('');
    setElapsed(0);
    startRef.current = null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveScanResult(projectId, result, mode);
      setPhase('saved');
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  const handleDiscard = () => {
    setPhase('idle');
    setResult('');
    setError(null);
    setElapsed(0);
    startRef.current = null;
    setViewingHistoryItem(null);
    setDiffMode(false);
  };

  const handleRescan = () => {
    handleStart();
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  // History
  const loadHistory = useCallback(async () => {
    if (!api.getScanHistory) return;
    setHistoryLoading(true);
    try {
      const data = await api.getScanHistory(projectId);
      setHistory(Array.isArray(data) ? (data as ScanHistoryItem[]) : []);
    } catch {
      setHistory([]);
    }
    setHistoryLoading(false);
  }, [projectId]);

  const handleToggleHistory = () => {
    if (!showHistory) loadHistory();
    setShowHistory(!showHistory);
  };

  const handleDeleteScan = async (id: number) => {
    if (!api.deleteScan) return;
    try {
      await api.deleteScan(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (viewingHistoryItem?.id === id) {
        setViewingHistoryItem(null);
        setDiffMode(false);
      }
    } catch {}
  };

  const handleViewHistoryItem = async (item: ScanHistoryItem) => {
    if (viewingHistoryItem?.id === item.id) {
      setViewingHistoryItem(null);
      setDiffMode(false);
      return;
    }
    if (api.getScanDetail && !item.content) {
      try {
        const detail = await api.getScanDetail(item.id);
        setViewingHistoryItem(detail as ScanHistoryItem);
      } catch {
        setViewingHistoryItem(item);
      }
    } else {
      setViewingHistoryItem(item);
    }
  };

  const handleCompare = () => {
    setDiffMode(!diffMode);
  };

  // Word count
  const wordCount = useMemo(() => {
    if (!result) return 0;
    return result
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  }, [result]);

  // Search highlight logic
  const highlightedResult = useMemo(() => {
    if (!searchQuery || !result) return null;
    const parts: { text: string; highlight: boolean }[] = [];
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(result)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: result.slice(lastIndex, match.index), highlight: false });
      }
      parts.push({ text: match[1] ?? '', highlight: true });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < result.length) {
      parts.push({ text: result.slice(lastIndex), highlight: false });
    }
    return parts.length > 0 ? parts : null;
  }, [searchQuery, result]);

  const searchMatchCount = useMemo(() => {
    if (!searchQuery || !result) return 0;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (result.match(regex) || []).length;
  }, [searchQuery, result]);

  const isScanning = phase === 'scanning';
  const isLargeCodebase = (prescan?.fileCount ?? 0) > 5000;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={isScanning ? undefined : onClose}
    >
      <div
        className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-2xl mx-4 shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ScanSearch size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold">{t('scan.title')}</h2>
            {phase === 'preview' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">
                {t('scan.review')}
              </span>
            )}
            {phase === 'saved' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
                {t('scan.saved')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {phase !== 'idle' && (
              <div className="flex items-center gap-3 text-[10px] text-surface-500 mr-1">
                <span className="flex items-center gap-1">
                  <Clock size={10} className={isScanning ? 'text-amber-400' : ''} />
                  {formatElapsed(elapsed)}
                </span>
                {isScanning && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
              </div>
            )}
            <button
              onClick={handleToggleHistory}
              className={`p-1 rounded-lg hover:bg-surface-800 transition-colors ${showHistory ? 'text-blue-400' : 'text-surface-400'}`}
              title={t('scan.history')}
            >
              <History size={16} />
            </button>
            <button
              onClick={onClose}
              disabled={isScanning}
              className="p-1 rounded-lg hover:bg-surface-800 text-surface-400 disabled:opacity-30"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          {/* Scan Type Presets — show in idle */}
          {phase === 'idle' && (
            <ScanIdleView
              scanType={scanType}
              setScanType={setScanType}
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              prescan={prescan}
              prescanLoading={prescanLoading}
              isLargeCodebase={isLargeCodebase}
            />
          )}

          {/* Scanning */}
          {isScanning && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <Loader2 size={32} className="text-blue-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm text-surface-200 font-medium">{t('scan.scanning')}</p>
                <p className="text-xs text-surface-500 mt-1">{progressText || t('scan.scanningDesc')}</p>
              </div>
              {/* Indeterminate progress bar */}
              <div className="w-full max-w-xs h-1.5 bg-surface-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-scan-progress" />
              </div>
              <p className="text-[10px] text-surface-600">{formatElapsed(elapsed)}</p>
            </div>
          )}

          {/* Preview */}
          {(phase === 'preview' || phase === 'saved') && result && (
            <ScanPreview
              phase={phase}
              result={result}
              setResult={setResult}
              mode={mode}
              setMode={setMode}
              showSearch={showSearch}
              setShowSearch={setShowSearch}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchRef={searchRef}
              searchMatchCount={searchMatchCount}
              highlightedResult={highlightedResult}
              wordCount={wordCount}
              viewMode={viewMode}
              setViewMode={setViewMode}
              copied={copied}
              handleCopy={handleCopy}
              diffMode={diffMode}
              viewingHistoryItem={viewingHistoryItem}
              textareaRef={textareaRef}
            />
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-red-400 font-medium">{t('scan.failed')}</p>
                <p className="text-[11px] text-red-400/70 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* History Panel */}
          {showHistory && (
            <ScanHistoryPanel
              history={history}
              historyLoading={historyLoading}
              viewingHistoryItem={viewingHistoryItem}
              diffMode={diffMode}
              result={result}
              phase={phase}
              handleViewHistoryItem={handleViewHistoryItem}
              handleCompare={handleCompare}
              handleDeleteScan={handleDeleteScan}
            />
          )}
        </div>

        {/* Footer */}
        <ScanFooter
          phase={phase}
          isScanning={isScanning}
          scanType={scanType}
          customPrompt={customPrompt}
          saving={saving}
          onClose={onClose}
          handleStart={handleStart}
          handleCancel={handleCancel}
          handleDiscard={handleDiscard}
          handleRescan={handleRescan}
          handleSave={handleSave}
        />
      </div>

      {/* Inline animation style */}
      <style>{`
        @keyframes scan-progress {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 40%; margin-left: 30%; }
          100% { width: 0%; margin-left: 100%; }
        }
        .animate-scan-progress {
          animation: scan-progress 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
