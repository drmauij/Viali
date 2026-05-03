// tests/anesthesia-settings-translate.test.tsx
import { describe, it, expect } from 'vitest';
import {
  collectItemsForTab,
  buildTranslateRequest,
  applyTranslationsToSettings,
  ALL_LANGS,
} from '../client/src/lib/translateBulk';
import type { IllnessListItem } from '../shared/schema';
import type { HospitalAnesthesiaSettings } from '../client/src/hooks/useHospitalAnesthesiaSettings';

const item = (over: Partial<IllnessListItem> = {}): IllnessListItem => ({
  id: 'a',
  label: 'Bluthochdruck',
  labelSourceLang: 'de',
  ...over,
});

const baseSettings: HospitalAnesthesiaSettings = {
  id: 's1',
  hospitalId: 'h1',
  allergyList: [item()],
  medicationLists: { anticoagulation: [], general: [] },
  illnessLists: { cardiovascular: [] },
  checklistItems: { signIn: [], timeOut: [], signOut: [] },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('collectItemsForTab', () => {
  it('returns allergyList items for the allergies tab', () => {
    const result = collectItemsForTab('allergies', baseSettings);
    expect(result).toHaveLength(1);
    expect(result[0].pathHint).toBe('allergyList');
    expect(result[0].item.id).toBe('a');
  });

  it('returns both anticoagulation and general for medications tab', () => {
    const settings: HospitalAnesthesiaSettings = {
      ...baseSettings,
      medicationLists: {
        anticoagulation: [item({ id: 'm1' })],
        general: [item({ id: 'm2' })],
      },
    };
    const result = collectItemsForTab('medications', settings);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.pathHint).sort()).toEqual(
      ['medicationLists.anticoagulation', 'medicationLists.general'],
    );
  });

  it('walks all illness categories dynamically', () => {
    const settings: HospitalAnesthesiaSettings = {
      ...baseSettings,
      illnessLists: {
        cardiovascular: [item({ id: 'i1' })],
        pulmonary: [item({ id: 'i2' })],
      },
    };
    const result = collectItemsForTab('illness', settings);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.pathHint).sort()).toEqual(
      ['illnessLists.cardiovascular', 'illnessLists.pulmonary'],
    );
  });

  it('returns empty array when settings is undefined', () => {
    expect(collectItemsForTab('allergies', undefined)).toEqual([]);
  });
});

describe('buildTranslateRequest', () => {
  it('skips items where every target language is already translated', () => {
    const fullyTranslated = item({
      labelTranslations: ALL_LANGS.filter(l => l !== 'de').reduce<Record<string, string>>((acc, l) => {
        acc[l] = `t-${l}`;
        return acc;
      }, {}),
    });
    const req = buildTranslateRequest(
      [{ pathHint: 'allergyList', item: fullyTranslated }],
      false,
    );
    expect(req.items).toHaveLength(0);
    expect(req.targetLangsByItem.size).toBe(0);
  });

  it('includes only missing target languages per item', () => {
    const partiallyTranslated = item({ labelTranslations: { en: 'Hypertension' } });
    const req = buildTranslateRequest(
      [{ pathHint: 'allergyList', item: partiallyTranslated }],
      false,
    );
    expect(req.items).toHaveLength(1);
    expect(req.items[0]).toEqual({ id: 'a', field: 'label', text: 'Bluthochdruck' });
    expect(req.targetLangsByItem.get('a:label')?.sort()).toEqual(['es', 'fr', 'it', 'zh']);
  });

  it('respects manual overrides even when force=true', () => {
    const itemWithOverride = item({
      labelTranslations: { en: 'My override' },
      labelOverrides: { en: true },
    });
    const req = buildTranslateRequest(
      [{ pathHint: 'allergyList', item: itemWithOverride }],
      true,
    );
    expect(req.targetLangsByItem.get('a:label')).not.toContain('en');
  });

  it('with force=true, re-requests every non-overridden lang regardless of existing translation', () => {
    const itemWithSomeTranslations = item({
      labelTranslations: { en: 'Hypertension', it: 'Ipertensione' },
      // no overrides set
    });
    const req = buildTranslateRequest(
      [{ pathHint: 'allergyList', item: itemWithSomeTranslations }],
      true,
    );
    expect(req.targetLangsByItem.get('a:label')?.sort()).toEqual(['en', 'es', 'fr', 'it', 'zh']);
  });

  it('handles items with patientLabel and patientHelpText fields independently', () => {
    const richItem = item({
      patientLabel: 'Hoher Blutdruck',
      patientHelpText: 'Hilfetext',
    });
    const req = buildTranslateRequest(
      [{ pathHint: 'allergyList', item: richItem }],
      false,
    );
    // Three fields, each missing 5 target langs.
    expect(req.items).toHaveLength(3);
    expect(req.items.map(i => i.field).sort()).toEqual(['label', 'patientHelpText', 'patientLabel']);
  });

  it('skips fields whose source value is empty/undefined', () => {
    const onlyLabelItem = item({ patientLabel: undefined });
    const req = buildTranslateRequest(
      [{ pathHint: 'allergyList', item: onlyLabelItem }],
      false,
    );
    expect(req.items.map(i => i.field)).toEqual(['label']);
  });
});

describe('applyTranslationsToSettings (allergies)', () => {
  it('merges new translations without dropping existing ones', () => {
    const before: HospitalAnesthesiaSettings = {
      ...baseSettings,
      allergyList: [item({ labelTranslations: { en: 'Hypertension' } })],
    };
    const after = applyTranslationsToSettings(before, 'allergies', {
      'a:label': { it: 'Ipertensione', fr: 'Hypertension' },
    });
    expect(after.allergyList?.[0].labelTranslations).toEqual({
      en: 'Hypertension',
      it: 'Ipertensione',
      fr: 'Hypertension',
    });
  });

  it('does NOT overwrite langs marked as overrides, even if agg includes them', () => {
    const before: HospitalAnesthesiaSettings = {
      ...baseSettings,
      allergyList: [item({
        labelTranslations: { en: 'My override' },
        labelOverrides: { en: true },
      })],
    };
    const after = applyTranslationsToSettings(before, 'allergies', {
      'a:label': { en: 'AI translation', it: 'Ipertensione' },
    });
    // English override is preserved; Italian flows through.
    expect(after.allergyList?.[0].labelTranslations?.en).toBe('My override');
    expect(after.allergyList?.[0].labelTranslations?.it).toBe('Ipertensione');
  });

  it('returns input unchanged when agg is empty', () => {
    const before: HospitalAnesthesiaSettings = {
      ...baseSettings,
      allergyList: [item({ labelTranslations: { en: 'Hypertension' } })],
    };
    const after = applyTranslationsToSettings(before, 'allergies', {});
    expect(after.allergyList?.[0].labelTranslations).toEqual({ en: 'Hypertension' });
  });
});

describe('applyTranslationsToSettings (medications, illness)', () => {
  it('preserves the other medication subkey when merging anticoagulation', () => {
    const before: HospitalAnesthesiaSettings = {
      ...baseSettings,
      medicationLists: {
        anticoagulation: [item({ id: 'a1' })],
        general: [item({ id: 'g1', labelTranslations: { en: 'kept' } })],
      },
    };
    const after = applyTranslationsToSettings(before, 'medications', {
      'a1:label': { en: 'A1' },
    });
    expect(after.medicationLists?.anticoagulation?.[0].labelTranslations?.en).toBe('A1');
    expect(after.medicationLists?.general?.[0].labelTranslations?.en).toBe('kept');
  });

  it('preserves untouched illness categories', () => {
    const before: HospitalAnesthesiaSettings = {
      ...baseSettings,
      illnessLists: {
        cardiovascular: [item({ id: 'c1' })],
        pulmonary: [item({ id: 'p1', labelTranslations: { en: 'kept' } })],
      },
    };
    const after = applyTranslationsToSettings(before, 'illness', {
      'c1:label': { en: 'Cardio' },
    });
    expect((after.illnessLists as any)?.cardiovascular?.[0].labelTranslations?.en).toBe('Cardio');
    expect((after.illnessLists as any)?.pulmonary?.[0].labelTranslations?.en).toBe('kept');
  });
});
