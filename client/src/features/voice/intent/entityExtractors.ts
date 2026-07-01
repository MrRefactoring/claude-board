/**
 * Entity extraction from voice input (multi-language).
 */

import { TYPE_MAP, PRIORITY_MAP } from '../i18n/patterns';
import { t } from '../i18n/t';

export function extractTaskType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_MAP)) {
    if (keywords.some((k) => lower.includes(k))) return type;
  }
  return null;
}

export function extractPriority(text: string): number | null {
  const lower = text.toLowerCase();
  for (const [priority, keywords] of Object.entries(PRIORITY_MAP)) {
    if (keywords.some((k) => lower.includes(k))) return Number(priority);
  }
  return null;
}

export function extractModel(text: string): string | null {
  const lower = text.toLowerCase();
  const MODEL_MAP: Record<string, string[]> = {
    haiku: ['haiku'],
    sonnet: ['sonnet'],
    opus: ['opus'],
  };
  for (const [model, keywords] of Object.entries(MODEL_MAP)) {
    if (keywords.some((k) => lower.includes(k))) return model;
  }
  return null;
}

export function priorityLabel(priority: number, lang: string = 'en-US'): string {
  return t(`priority.${priority}`, lang) || t('priority.0', lang);
}
