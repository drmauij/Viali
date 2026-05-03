// client/src/lib/translateBulk.ts
import type { Lang, LangMap, OverrideMap, TranslatableField } from "@shared/i18n";
import { SUPPORTED_QUESTIONNAIRE_LANGS } from "@shared/i18n";
import type { IllnessListItem, LocalizedListItem } from "@shared/schema";
import type { HospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";

export type TabKey = 'allergies' | 'medications' | 'illness';

export const ALL_LANGS: readonly Lang[] = SUPPORTED_QUESTIONNAIRE_LANGS;
const TRANSLATABLE_FIELDS: TranslatableField[] = ['label', 'patientLabel', 'patientHelpText'];

type AnyItem = IllnessListItem | LocalizedListItem;

export function collectItemsForTab(
  tab: TabKey,
  settings: HospitalAnesthesiaSettings | undefined,
): Array<{ pathHint: string; item: IllnessListItem }> {
  if (!settings) return [];
  const out: Array<{ pathHint: string; item: IllnessListItem }> = [];
  if (tab === 'allergies') {
    for (const it of settings.allergyList || []) out.push({ pathHint: 'allergyList', item: it });
  } else if (tab === 'medications') {
    for (const it of settings.medicationLists?.anticoagulation || []) out.push({ pathHint: 'medicationLists.anticoagulation', item: it as IllnessListItem });
    for (const it of settings.medicationLists?.general || []) out.push({ pathHint: 'medicationLists.general', item: it as IllnessListItem });
  } else if (tab === 'illness') {
    const lists = settings.illnessLists || {};
    for (const cat of Object.keys(lists)) {
      const arr = (lists as any)[cat] as IllnessListItem[] | undefined;
      for (const it of arr || []) out.push({ pathHint: `illnessLists.${cat}`, item: it });
    }
  }
  return out;
}

export type TranslateRequestItem = { id: string; field: TranslatableField; text: string };

export function buildTranslateRequest(
  collected: Array<{ pathHint: string; item: IllnessListItem }>,
  force: boolean,
): { items: TranslateRequestItem[]; targetLangsByItem: Map<string, Lang[]> } {
  const items: TranslateRequestItem[] = [];
  const targetLangsByItem = new Map<string, Lang[]>();

  for (const { item } of collected) {
    const sourceLang = (item.labelSourceLang || 'de') as Lang;
    for (const field of TRANSLATABLE_FIELDS) {
      const text = (item as any)[field] as string | undefined;
      if (!text) continue;
      const translations = (item as any)[`${field}Translations`] as LangMap | undefined;
      const overrides = (item as any)[`${field}Overrides`] as OverrideMap | undefined;

      const missing = ALL_LANGS.filter(l => l !== sourceLang).filter(l => {
        if (overrides?.[l]) return false; // never overwrite manual overrides
        if (force) return true;
        return !translations?.[l];
      });
      if (missing.length === 0) continue;
      items.push({ id: item.id, field, text });
      targetLangsByItem.set(`${item.id}:${field}`, [...missing]);
    }
  }
  return { items, targetLangsByItem };
}

export function applyTranslationsToSettings(
  settings: HospitalAnesthesiaSettings,
  tab: TabKey,
  agg: Record<string, Partial<Record<Lang, string>>>,
): Partial<HospitalAnesthesiaSettings> {
  const mergeField = <T extends AnyItem>(item: T, field: TranslatableField): T => {
    const key = `${item.id}:${field}`;
    const incoming = agg[key];
    if (!incoming) return item;
    const tKey = `${field}Translations` as const;
    const existing = ((item as any)[tKey] as LangMap | undefined) || {};
    return { ...item, [tKey]: { ...existing, ...incoming } } as T;
  };
  const mergeItem = <T extends AnyItem>(it: T): T =>
    TRANSLATABLE_FIELDS.reduce((acc, f) => mergeField(acc, f), it);

  if (tab === 'allergies') {
    return { allergyList: (settings.allergyList || []).map(mergeItem) };
  }
  if (tab === 'medications') {
    return {
      medicationLists: {
        ...settings.medicationLists,
        anticoagulation: (settings.medicationLists?.anticoagulation || []).map(mergeItem),
        general: (settings.medicationLists?.general || []).map(mergeItem),
      },
    };
  }
  // illness
  const next: any = { ...(settings.illnessLists || {}) };
  for (const cat of Object.keys(settings.illnessLists || {})) {
    next[cat] = ((settings.illnessLists as any)?.[cat] || []).map(mergeItem);
  }
  return { illnessLists: next };
}
