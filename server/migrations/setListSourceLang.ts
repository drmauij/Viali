// server/migrations/setListSourceLang.ts
//
// One-shot idempotent backfill: for every hospital_anesthesia_settings row,
// set labelSourceLang on every list item to the hospital's defaultLanguage,
// and lift legacy flat fields (labelDe/labelEn, etc.) into the *Translations
// maps — but only if the map doesn't already have an entry for that lang.
// Legacy flat fields are deleted after lifting.
//
// Safe to run multiple times: second run is a no-op because legacy fields are
// already gone and labelSourceLang is already set.

import { db } from '../db';
import { hospitalAnesthesiaSettings, hospitals } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { Lang } from '@shared/i18n';

type Item = Record<string, any>;

function migrateItem(item: Item, defaultLang: Lang): Item {
  if (!item || typeof item !== 'object') return item;

  // Lift legacy flat fields into the translations map (only if not already present).
  const labelTranslations = { ...(item.labelTranslations || {}) };
  if (item.labelDe && !labelTranslations.de) labelTranslations.de = item.labelDe;
  if (item.labelEn && !labelTranslations.en) labelTranslations.en = item.labelEn;

  const patientLabelTranslations = { ...(item.patientLabelTranslations || {}) };
  if (item.patientLabelDe && !patientLabelTranslations.de) patientLabelTranslations.de = item.patientLabelDe;
  if (item.patientLabelEn && !patientLabelTranslations.en) patientLabelTranslations.en = item.patientLabelEn;

  const patientHelpTextTranslations = { ...(item.patientHelpTextTranslations || {}) };
  if (item.patientHelpTextDe && !patientHelpTextTranslations.de) patientHelpTextTranslations.de = item.patientHelpTextDe;
  if (item.patientHelpTextEn && !patientHelpTextTranslations.en) patientHelpTextTranslations.en = item.patientHelpTextEn;

  const next: Item = {
    ...item,
    // Only write labelSourceLang if it's not already set (nullish-coalesce).
    labelSourceLang: item.labelSourceLang ?? defaultLang,
  };

  // Only write translation maps when there's something to write.
  if (Object.keys(labelTranslations).length > 0) next.labelTranslations = labelTranslations;
  if (Object.keys(patientLabelTranslations).length > 0) next.patientLabelTranslations = patientLabelTranslations;
  if (Object.keys(patientHelpTextTranslations).length > 0) next.patientHelpTextTranslations = patientHelpTextTranslations;

  // Drop legacy flat fields once lifted (safe even if they don't exist).
  delete next.labelDe;
  delete next.labelEn;
  delete next.patientLabelDe;
  delete next.patientLabelEn;
  delete next.patientHelpTextDe;
  delete next.patientHelpTextEn;

  return next;
}

function migrateArray(arr: Item[] | undefined | null, defaultLang: Lang): Item[] | undefined | null {
  if (!Array.isArray(arr)) return arr;
  return arr.map(it => migrateItem(it, defaultLang));
}

function migrateGroupedLists<T extends Record<string, Item[]>>(
  groups: T | null | undefined,
  defaultLang: Lang,
): T | null | undefined {
  if (!groups || typeof groups !== 'object') return groups;
  const out: any = {};
  for (const k of Object.keys(groups)) {
    out[k] = migrateArray(groups[k], defaultLang);
  }
  return out;
}

export async function migrateListSourceLang(): Promise<{ migrated: number }> {
  const allHospitals = await db.select({
    id: hospitals.id,
    defaultLanguage: hospitals.defaultLanguage,
  }).from(hospitals);

  let migrated = 0;

  for (const h of allHospitals) {
    const defaultLang = (h.defaultLanguage === 'en' ? 'en' : 'de') as Lang;

    const settingsRows = await db.select()
      .from(hospitalAnesthesiaSettings)
      .where(eq(hospitalAnesthesiaSettings.hospitalId, h.id));

    if (settingsRows.length === 0) continue;
    const s = settingsRows[0];

    const next = {
      allergyList: migrateArray(s.allergyList as any, defaultLang) as any,
      medicationLists: migrateGroupedLists(s.medicationLists as any, defaultLang) as any,
      illnessLists: migrateGroupedLists(s.illnessLists as any, defaultLang) as any,
      checklistItems: migrateGroupedLists(s.checklistItems as any, defaultLang) as any,
    };

    await db.update(hospitalAnesthesiaSettings)
      .set(next)
      .where(eq(hospitalAnesthesiaSettings.id, s.id));

    migrated += 1;
    console.log(`[setListSourceLang] migrated hospital ${h.id} (defaultLang=${defaultLang})`);
  }

  return { migrated };
}

// Self-runnable entry point (ESM-style, matching project convention).
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateListSourceLang()
    .then(r => {
      console.log(`Done. Migrated ${r.migrated} hospital(s).`);
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
