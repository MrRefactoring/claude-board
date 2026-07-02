import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import type { TranslateFn } from '@/lib/types';
import en from '@/i18n/locales/en';
import tr from '@/i18n/locales/tr';

/**
 * To add a new language:
 * 1. Create client/src/i18n/locales/{code}.js (copy en.js as template)
 * 2. Add import and entry to `locales` and `LANGUAGES` below
 * 3. That's it — the language selector will pick it up automatically
 */
type Locale = Record<string, string>;

export interface Language {
  code: string;
  label: string;
  flag?: string;
}

export interface I18nContextValue {
  lang: string;
  setLang: (code: string) => void;
  t: TranslateFn;
  languages: Language[];
}

const locales: Record<string, Locale> = { en, tr };

const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  // { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  // { code: 'fr', label: 'Français', flag: '🇫🇷' },
  // { code: 'es', label: 'Español', flag: '🇪🇸' },
  // { code: 'ja', label: '日本語', flag: '🇯🇵' },
];

const SUPPORTED = LANGUAGES.map((l) => l.code);
const STORAGE_KEY = 'ui-lang';

function detectLang(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {}
  const nav = (navigator.language || '').split('-')[0];
  return SUPPORTED.includes(nav) ? nav : 'en';
}

const I18nCtx = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(detectLang);

  const setLang = useCallback((code: string) => {
    if (!SUPPORTED.includes(code)) return;
    setLangState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {}
  }, []);

  const t = useCallback<TranslateFn>(
    (key, params) => {
      const str = locales[lang]?.[key] ?? locales.en[key] ?? key;
      if (!params) return str;
      return str.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
    },
    [lang],
  );

  // Sync language from backend settings on first load (setup saves to DB, not localStorage)
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      api
        .getAppSettings()
        .then((s) => {
          const language = (s as { language?: string } | null)?.language;
          if (language && SUPPORTED.includes(language)) {
            setLang(language);
          }
        })
        .catch(() => {});
    }
  }, [setLang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t, languages: LANGUAGES }), [lang, setLang, t]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

const fallbackCtx: I18nContextValue = {
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
  languages: [],
};

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nCtx);
  if (!ctx) {
    console.warn('useTranslation called outside I18nProvider — using fallback');
    return fallbackCtx;
  }
  return ctx;
}
