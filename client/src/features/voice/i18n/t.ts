import locales from '@/features/voice/i18n/locales';

/**
 * Translate a key for the given language, with optional interpolation.
 * Falls back to en-US if the key (or language) is missing.
 *
 * @param key - Dot-separated key (e.g. 'create.askTitle')
 * @param lang - Language code (e.g. 'tr-TR'); defaults to en-US when omitted
 * @param params - Interpolation params
 */
export function t(key: string, lang?: string, params?: Record<string, string | number | undefined>): string {
  const str = locales[lang ?? 'en-US']?.[key] ?? locales['en-US']?.[key] ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
