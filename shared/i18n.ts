export const SUPPORTED_QUESTIONNAIRE_LANGS = ['de', 'en', 'it', 'es', 'fr', 'zh'] as const;
export type Lang = typeof SUPPORTED_QUESTIONNAIRE_LANGS[number];

export const isSupportedLang = (v: unknown): v is Lang =>
  typeof v === 'string' && (SUPPORTED_QUESTIONNAIRE_LANGS as readonly string[]).includes(v);

export type TranslatableField = 'label' | 'patientLabel' | 'patientHelpText';

export type LangMap = Partial<Record<Lang, string>>;
export type OverrideMap = Partial<Record<Lang, true>>;

export const LANG_DISPLAY_NAMES: Record<Lang, string> = {
  de: 'German',
  en: 'English',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  zh: 'Simplified Chinese',
};

import type { IllnessListItem } from './schema';

const TRANSLATIONS_KEY: Record<TranslatableField, keyof IllnessListItem> = {
  label: 'labelTranslations',
  patientLabel: 'patientLabelTranslations',
  patientHelpText: 'patientHelpTextTranslations',
};

export function resolveLocalized(
  item: IllnessListItem,
  lang: Lang,
  field: TranslatableField = 'label',
): string | undefined {
  const sourceText = item[field] as string | undefined;
  const translations = item[TRANSLATIONS_KEY[field]] as LangMap | undefined;
  const sourceLang = item.labelSourceLang;

  const explicit = translations?.[lang];
  if (explicit && explicit.length > 0) return explicit;

  if (sourceLang && lang === sourceLang && sourceText) return sourceText;

  const englishFallback = translations?.en;
  if (englishFallback && englishFallback.length > 0) return englishFallback;

  return sourceText && sourceText.length > 0 ? sourceText : undefined;
}
