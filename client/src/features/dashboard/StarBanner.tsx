import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nProvider';

const DISMISSED_KEY = 'star_banner_dismissed';
const REPO_URL = 'https://github.com/bahri-hirfanoglu/claude-board';

export function StarBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="relative mb-6 rounded-xl border border-claude/30 bg-gradient-to-r from-claude/10 via-amber-500/5 to-transparent px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-claude/15 flex items-center justify-center flex-shrink-0">
        <Star size={16} className="text-amber-400 fill-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-surface-100">{t('dashboard.starTitle')}</p>
        <p className="text-[11px] text-surface-400 mt-0.5">{t('dashboard.starDesc')}</p>
      </div>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={dismiss}
        className="px-3 py-1.5 text-xs font-medium bg-claude hover:bg-claude-light text-white rounded-lg flex items-center gap-1.5 flex-shrink-0 transition-colors"
      >
        <Star size={12} className="fill-white" />
        {t('dashboard.starCta')}
      </a>
      <button
        onClick={dismiss}
        aria-label={t('dashboard.starDismiss')}
        className="p-1 text-surface-600 hover:text-surface-400 flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
