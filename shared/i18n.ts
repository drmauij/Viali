export const SUPPORTED_QUESTIONNAIRE_LANGS = ['de', 'en', 'it', 'es', 'fr', 'zh'] as const;
export type Lang = typeof SUPPORTED_QUESTIONNAIRE_LANGS[number];

export const isSupportedLang = (v: unknown): v is Lang =>
  typeof v === 'string' && (SUPPORTED_QUESTIONNAIRE_LANGS as readonly string[]).includes(v);

export type TranslatableField = 'label' | 'patientLabel' | 'patientHelpText';

export type LangMap = Partial<Record<Lang, string>>;
export type OverrideMap = Partial<Record<Lang, true>>;
