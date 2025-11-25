import { db } from "../storage";
import { sql } from "drizzle-orm";

interface OldChecklistItems {
  signIn?: string[];
  timeOut?: string[];
  signOut?: string[];
}

interface NewChecklistItem {
  id: string;
  label: string;
}

interface NewChecklistItems {
  signIn?: NewChecklistItem[];
  timeOut?: NewChecklistItem[];
  signOut?: NewChecklistItem[];
}

function generateIdFromLabel(label: string): string {
  return label
    .trim()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

function convertChecklistItems(oldItems: OldChecklistItems | null): NewChecklistItems | null {
  if (!oldItems) return null;
  
  const result: NewChecklistItems = {};
  
  for (const key of ['signIn', 'timeOut', 'signOut'] as const) {
    const items = oldItems[key];
    if (items && Array.isArray(items)) {
      if (items.length > 0 && typeof items[0] === 'string') {
        result[key] = items.map((label: string) => ({
          id: generateIdFromLabel(label),
          label: label,
        }));
      } else {
        result[key] = items as any;
      }
    }
  }
  
  return result;
}

function buildKeyMapping(checklistItems: NewChecklistItems | null): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  if (!checklistItems) return mapping;
  
  for (const key of ['signIn', 'timeOut', 'signOut'] as const) {
    const items = checklistItems[key];
    if (items) {
      for (const item of items) {
        const oldKey = item.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        mapping[oldKey] = item.id;
      }
    }
  }
  
  return mapping;
}

function migrateChecklistData(
  data: { checklist?: Record<string, boolean> } | null,
  keyMapping: Record<string, string>
): { checklist?: Record<string, boolean> } | null {
  if (!data || !data.checklist) return data;
  
  const newChecklist: Record<string, boolean> = {};
  
  for (const [oldKey, value] of Object.entries(data.checklist)) {
    const newKey = keyMapping[oldKey] || oldKey;
    newChecklist[newKey] = value;
  }
  
  return { ...data, checklist: newChecklist };
}

export async function migrateChecklistsToIdBased() {
  console.log('[CHECKLIST-MIGRATION] Starting checklist data migration...');
  
  try {
    const settings = await db.execute(sql`
      SELECT id, hospital_id, checklist_items 
      FROM hospital_anesthesia_settings 
      WHERE checklist_items IS NOT NULL
    `);
    
    console.log(`[CHECKLIST-MIGRATION] Found ${settings.rows.length} hospital settings to migrate`);
    
    const hospitalKeyMappings: Record<string, Record<string, string>> = {};
    
    for (const setting of settings.rows) {
      const oldItems = setting.checklist_items as OldChecklistItems | null;
      
      if (!oldItems) continue;
      
      const isAlreadyMigrated = oldItems.signIn?.[0] && 
        typeof oldItems.signIn[0] === 'object' && 
        'id' in (oldItems.signIn[0] as any);
      
      if (isAlreadyMigrated) {
        console.log(`[CHECKLIST-MIGRATION] Hospital ${setting.hospital_id} already migrated, building key mapping...`);
        hospitalKeyMappings[setting.hospital_id as string] = buildKeyMapping(oldItems as unknown as NewChecklistItems);
        continue;
      }
      
      const newItems = convertChecklistItems(oldItems);
      
      if (newItems) {
        await db.execute(sql`
          UPDATE hospital_anesthesia_settings 
          SET checklist_items = ${JSON.stringify(newItems)}::jsonb,
              updated_at = NOW()
          WHERE id = ${setting.id}
        `);
        
        hospitalKeyMappings[setting.hospital_id as string] = buildKeyMapping(newItems);
        console.log(`[CHECKLIST-MIGRATION] Migrated settings for hospital ${setting.hospital_id}`);
      }
    }
    
    const records = await db.execute(sql`
      SELECT ar.id, ar.sign_in_data, ar.time_out_data, ar.sign_out_data, s.hospital_id
      FROM anesthesia_records ar
      JOIN surgeries s ON ar.surgery_id = s.id
      WHERE ar.sign_in_data IS NOT NULL 
         OR ar.time_out_data IS NOT NULL 
         OR ar.sign_out_data IS NOT NULL
    `);
    
    console.log(`[CHECKLIST-MIGRATION] Found ${records.rows.length} anesthesia records to migrate`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const record of records.rows) {
      const keyMapping = hospitalKeyMappings[record.hospital_id as string] || {};
      
      if (Object.keys(keyMapping).length === 0) {
        skippedCount++;
        continue;
      }
      
      const signInData = migrateChecklistData(record.sign_in_data as any, keyMapping);
      const timeOutData = migrateChecklistData(record.time_out_data as any, keyMapping);
      const signOutData = migrateChecklistData(record.sign_out_data as any, keyMapping);
      
      await db.execute(sql`
        UPDATE anesthesia_records
        SET sign_in_data = ${signInData ? JSON.stringify(signInData) : null}::jsonb,
            time_out_data = ${timeOutData ? JSON.stringify(timeOutData) : null}::jsonb,
            sign_out_data = ${signOutData ? JSON.stringify(signOutData) : null}::jsonb,
            updated_at = NOW()
        WHERE id = ${record.id}
      `);
      
      migratedCount++;
    }
    
    console.log(`[CHECKLIST-MIGRATION] Migration complete!`);
    console.log(`[CHECKLIST-MIGRATION] - Migrated ${migratedCount} anesthesia records`);
    console.log(`[CHECKLIST-MIGRATION] - Skipped ${skippedCount} records (no key mapping)`);
    
    return { success: true, migratedCount, skippedCount };
    
  } catch (error) {
    console.error('[CHECKLIST-MIGRATION] Migration failed:', error);
    throw error;
  }
}

export async function migrateAllergiesAndMedsToIdBased() {
  console.log('[SETTINGS-MIGRATION] Starting allergies and medications migration...');
  
  try {
    const settings = await db.execute(sql`
      SELECT id, hospital_id, allergy_list, medication_lists 
      FROM hospital_anesthesia_settings 
    `);
    
    console.log(`[SETTINGS-MIGRATION] Found ${settings.rows.length} hospital settings to check`);
    
    let migratedCount = 0;
    
    for (const setting of settings.rows) {
      const allergyList = setting.allergy_list as any[] | null;
      const medicationLists = setting.medication_lists as { anticoagulation?: any[]; general?: any[] } | null;
      
      let needsMigration = false;
      let newAllergyList = allergyList;
      let newMedicationLists = medicationLists;
      
      // Check if allergyList needs migration (old format: string[], new format: {id, label}[])
      if (allergyList && allergyList.length > 0 && typeof allergyList[0] === 'string') {
        needsMigration = true;
        newAllergyList = allergyList.map((label: string) => ({
          id: generateIdFromLabel(label),
          label: label,
        }));
        console.log(`[SETTINGS-MIGRATION] Hospital ${setting.hospital_id}: migrating ${allergyList.length} allergies`);
      }
      
      // Check if medicationLists needs migration
      if (medicationLists) {
        if (medicationLists.anticoagulation && medicationLists.anticoagulation.length > 0 && 
            typeof medicationLists.anticoagulation[0] === 'string') {
          needsMigration = true;
          newMedicationLists = {
            ...newMedicationLists,
            anticoagulation: medicationLists.anticoagulation.map((label: string) => ({
              id: generateIdFromLabel(label),
              label: label,
            })),
          };
          console.log(`[SETTINGS-MIGRATION] Hospital ${setting.hospital_id}: migrating ${medicationLists.anticoagulation.length} anticoagulation meds`);
        }
        
        if (medicationLists.general && medicationLists.general.length > 0 && 
            typeof medicationLists.general[0] === 'string') {
          needsMigration = true;
          newMedicationLists = {
            ...newMedicationLists,
            general: medicationLists.general.map((label: string) => ({
              id: generateIdFromLabel(label),
              label: label,
            })),
          };
          console.log(`[SETTINGS-MIGRATION] Hospital ${setting.hospital_id}: migrating ${medicationLists.general.length} general meds`);
        }
      }
      
      if (needsMigration) {
        await db.execute(sql`
          UPDATE hospital_anesthesia_settings 
          SET allergy_list = ${newAllergyList ? JSON.stringify(newAllergyList) : null}::jsonb,
              medication_lists = ${newMedicationLists ? JSON.stringify(newMedicationLists) : null}::jsonb,
              updated_at = NOW()
          WHERE id = ${setting.id}
        `);
        migratedCount++;
        console.log(`[SETTINGS-MIGRATION] Migrated settings for hospital ${setting.hospital_id}`);
      }
    }
    
    console.log(`[SETTINGS-MIGRATION] Migration complete! Migrated ${migratedCount} hospitals`);
    return { success: true, migratedCount };
    
  } catch (error) {
    console.error('[SETTINGS-MIGRATION] Migration failed:', error);
    throw error;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  Promise.all([
    migrateChecklistsToIdBased(),
    migrateAllergiesAndMedsToIdBased(),
  ])
    .then((results) => {
      console.log('[MIGRATION] All migrations complete:', results);
      process.exit(0);
    })
    .catch((error) => {
      console.error('[MIGRATION] Error:', error);
      process.exit(1);
    });
}
