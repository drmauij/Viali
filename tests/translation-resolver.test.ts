// tests/translation-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveLocalized } from '../shared/i18n';
import type { IllnessListItem } from '../shared/schema';

const mk = (overrides: Partial<IllnessListItem> = {}): IllnessListItem => ({
  id: 'x', label: 'Bluthochdruck', labelSourceLang: 'de',
  ...overrides,
});

describe('resolveLocalized', () => {
  it('returns the explicit translation when present', () => {
    const item = mk({ labelTranslations: { en: 'Hypertension', it: 'Ipertensione' } });
    expect(resolveLocalized(item, 'en')).toBe('Hypertension');
    expect(resolveLocalized(item, 'it')).toBe('Ipertensione');
  });

  it('returns source label when target lang equals source lang', () => {
    expect(resolveLocalized(mk(), 'de')).toBe('Bluthochdruck');
  });

  it('falls back to english translation when target missing and source is non-english', () => {
    const item = mk({ labelTranslations: { en: 'Hypertension' } });
    expect(resolveLocalized(item, 'fr')).toBe('Hypertension');
  });

  it('falls back to source label when no translations and lang differs from source', () => {
    expect(resolveLocalized(mk(), 'fr')).toBe('Bluthochdruck');
  });

  it('resolves patientLabel field independently from label', () => {
    const item = mk({
      patientLabel: 'Hoher Blutdruck',
      patientLabelTranslations: { en: 'High blood pressure' },
    });
    expect(resolveLocalized(item, 'en', 'patientLabel')).toBe('High blood pressure');
  });

  it('returns undefined for patientLabel when neither source nor translation exists', () => {
    expect(resolveLocalized(mk(), 'en', 'patientLabel')).toBeUndefined();
  });

  it('treats empty-string translation as missing', () => {
    const item = mk({ labelTranslations: { en: '' } });
    expect(resolveLocalized(item, 'en')).toBe('Bluthochdruck');
  });
});
