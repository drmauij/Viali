import { db } from '../db';
import { clinicalSnapshots } from '../../shared/schema';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * Migration script to transform clinical_snapshots from old structure to new
 * 
 * OLD: Multiple rows per record, each with timestamp + single values
 * NEW: One row per record with arrays of points (each point has ID + timestamp + value)
 */

interface OldSnapshot {
  id: string;
  anesthesiaRecordId: string;
  timestamp: Date;
  data: {
    hr?: number;
    sysBP?: number;
    diaBP?: number;
    meanBP?: number;
    spo2?: number;
    temp?: number;
    etco2?: number;
    pip?: number;
    peep?: number;
    tidalVolume?: number;
    respiratoryRate?: number;
    minuteVolume?: number;
    fio2?: number;
    gastricTube?: number;
    drainage?: number;
    vomit?: number;
    urine?: number;
    urine677?: number;
    blood?: number;
    bloodIrrigation?: number;
  };
}

interface VitalPoint {
  id: string;
  timestamp: string;
  value: number;
}

interface BPPoint {
  id: string;
  timestamp: string;
  sys: number;
  dia: number;
  mean?: number;
}

interface NewData {
  hr?: VitalPoint[];
  bp?: BPPoint[];
  spo2?: VitalPoint[];
  temp?: VitalPoint[];
  etco2?: VitalPoint[];
  pip?: VitalPoint[];
  peep?: VitalPoint[];
  tidalVolume?: VitalPoint[];
  respiratoryRate?: VitalPoint[];
  minuteVolume?: VitalPoint[];
  fio2?: VitalPoint[];
  gastricTube?: VitalPoint[];
  drainage?: VitalPoint[];
  vomit?: VitalPoint[];
  urine?: VitalPoint[];
  urine677?: VitalPoint[];
  blood?: VitalPoint[];
  bloodIrrigation?: VitalPoint[];
}

export async function migrateVitalsData() {
  console.log('[MIGRATION] Starting vitals data migration...');
  
  try {
    // Step 1: Fetch all existing snapshots
    console.log('[MIGRATION] Fetching existing snapshots...');
    const oldSnapshots = await db.execute(sql`
      SELECT id, anesthesia_record_id as "anesthesiaRecordId", timestamp, data
      FROM clinical_snapshots
      ORDER BY anesthesia_record_id, timestamp
    `);
    
    console.log(`[MIGRATION] Found ${oldSnapshots.rows.length} snapshots to migrate`);
    
    // Step 2: Group by anesthesiaRecordId
    const groupedByRecord = new Map<string, any[]>();
    for (const snapshot of oldSnapshots.rows) {
      const recordId = (snapshot as any).anesthesiaRecordId;
      if (!groupedByRecord.has(recordId)) {
        groupedByRecord.set(recordId, []);
      }
      groupedByRecord.get(recordId)!.push(snapshot);
    }
    
    console.log(`[MIGRATION] Grouped into ${groupedByRecord.size} records`);
    
    // Step 3: Transform each record's data
    const transformedRecords: Array<{ anesthesiaRecordId: string; data: NewData }> = [];
    
    for (const [recordId, snapshots] of Array.from(groupedByRecord.entries())) {
      const newData: NewData = {};
      
      // Group BP values by timestamp (sys, dia, mean must be together)
      const bpByTimestamp = new Map<string, Partial<BPPoint>>();
      
      for (const snapshot of snapshots) {
        // Handle timestamp - it's already a string from postgres, or a Date if somehow passed as one
        const timestamp = typeof snapshot.timestamp === 'string' 
          ? snapshot.timestamp 
          : new Date(snapshot.timestamp).toISOString();
        
        // Handle simple vitals
        if (snapshot.data.hr !== undefined) {
          if (!newData.hr) newData.hr = [];
          newData.hr.push({
            id: randomUUID(),
            timestamp,
            value: snapshot.data.hr,
          });
        }
        
        if (snapshot.data.spo2 !== undefined) {
          if (!newData.spo2) newData.spo2 = [];
          newData.spo2.push({
            id: randomUUID(),
            timestamp,
            value: snapshot.data.spo2,
          });
        }
        
        if (snapshot.data.temp !== undefined) {
          if (!newData.temp) newData.temp = [];
          newData.temp.push({
            id: randomUUID(),
            timestamp,
            value: snapshot.data.temp,
          });
        }
        
        // Handle BP specially - group by timestamp
        if (snapshot.data.sysBP !== undefined || snapshot.data.diaBP !== undefined || snapshot.data.meanBP !== undefined) {
          if (!bpByTimestamp.has(timestamp)) {
            bpByTimestamp.set(timestamp, { id: randomUUID(), timestamp });
          }
          const bp = bpByTimestamp.get(timestamp)!;
          if (snapshot.data.sysBP !== undefined) bp.sys = snapshot.data.sysBP;
          if (snapshot.data.diaBP !== undefined) bp.dia = snapshot.data.diaBP;
          if (snapshot.data.meanBP !== undefined) bp.mean = snapshot.data.meanBP;
        }
        
        // Handle ventilation parameters
        const vitalTypes: Array<keyof NewData> = [
          'etco2', 'pip', 'peep', 'tidalVolume', 'respiratoryRate', 'minuteVolume', 'fio2'
        ];
        
        for (const type of vitalTypes) {
          const value = snapshot.data[type as keyof typeof snapshot.data];
          if (value !== undefined) {
            if (!newData[type]) newData[type] = [];
            (newData[type] as VitalPoint[]).push({
              id: randomUUID(),
              timestamp,
              value: value as number,
            });
          }
        }
        
        // Handle output parameters
        const outputTypes: Array<keyof NewData> = [
          'gastricTube', 'drainage', 'vomit', 'urine', 'urine677', 'blood', 'bloodIrrigation'
        ];
        
        for (const type of outputTypes) {
          const value = snapshot.data[type as keyof typeof snapshot.data];
          if (value !== undefined) {
            if (!newData[type]) newData[type] = [];
            (newData[type] as VitalPoint[]).push({
              id: randomUUID(),
              timestamp,
              value: value as number,
            });
          }
        }
      }
      
      // Convert BP map to array
      if (bpByTimestamp.size > 0) {
        newData.bp = Array.from(bpByTimestamp.values())
          .filter(bp => bp.sys !== undefined && bp.dia !== undefined)
          .map(bp => bp as BPPoint)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      
      // Sort all arrays by timestamp
      for (const key of Object.keys(newData) as Array<keyof NewData>) {
        if (newData[key] && Array.isArray(newData[key])) {
          (newData[key] as any[]).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        }
      }
      
      transformedRecords.push({
        anesthesiaRecordId: recordId,
        data: newData,
      });
    }
    
    console.log(`[MIGRATION] Transformed ${transformedRecords.length} records`);
    
    // Step 4: Insert into new table
    console.log('[MIGRATION] Inserting into clinical_snapshots_new...');
    let inserted = 0;
    
    for (const record of transformedRecords) {
      await db.execute(sql`
        INSERT INTO clinical_snapshots_new (anesthesia_record_id, data, created_at, updated_at)
        VALUES (${record.anesthesiaRecordId}, ${JSON.stringify(record.data)}::jsonb, NOW(), NOW())
        ON CONFLICT (anesthesia_record_id) DO UPDATE
        SET data = ${JSON.stringify(record.data)}::jsonb, updated_at = NOW()
      `);
      inserted++;
      
      if (inserted % 100 === 0) {
        console.log(`[MIGRATION] Inserted ${inserted}/${transformedRecords.length} records...`);
      }
    }
    
    console.log(`[MIGRATION] Successfully inserted ${inserted} records`);
    
    // Step 5: Verify integrity
    console.log('[MIGRATION] Verifying data integrity...');
    
    const oldCount = await db.execute(sql`SELECT COUNT(DISTINCT anesthesia_record_id) as count FROM clinical_snapshots`);
    const newCount = await db.execute(sql`SELECT COUNT(*) as count FROM clinical_snapshots_new`);
    
    console.log(`[MIGRATION] Old distinct records: ${oldCount.rows[0].count}`);
    console.log(`[MIGRATION] New records: ${newCount.rows[0].count}`);
    
    if (oldCount.rows[0].count !== newCount.rows[0].count) {
      throw new Error('Record count mismatch! Migration may have failed.');
    }
    
    console.log('[MIGRATION] ✅ Migration completed successfully!');
    console.log('[MIGRATION] Next steps:');
    console.log('[MIGRATION]   1. Verify data manually if needed');
    console.log('[MIGRATION]   2. Run swapTables() to activate new schema');
    console.log('[MIGRATION]   3. Restart application');
    
    return {
      success: true,
      oldSnapshotCount: oldSnapshots.rows.length,
      newRecordCount: transformedRecords.length,
    };
    
  } catch (error) {
    console.error('[MIGRATION] ❌ Migration failed:', error);
    throw error;
  }
}

export async function swapTables() {
  console.log('[MIGRATION] Swapping tables...');
  
  try {
    await db.transaction(async (tx) => {
      // Rename old index first
      await tx.execute(sql`ALTER INDEX IF EXISTS idx_clinical_snapshots_record RENAME TO idx_clinical_snapshots_record_legacy`);
      console.log('[MIGRATION] Renamed idx_clinical_snapshots_record → idx_clinical_snapshots_record_legacy');
      
      // Rename old table to legacy
      await tx.execute(sql`ALTER TABLE clinical_snapshots RENAME TO clinical_snapshots_legacy`);
      console.log('[MIGRATION] Renamed clinical_snapshots → clinical_snapshots_legacy');
      
      // Rename new table to production
      await tx.execute(sql`ALTER TABLE clinical_snapshots_new RENAME TO clinical_snapshots`);
      console.log('[MIGRATION] Renamed clinical_snapshots_new → clinical_snapshots');
      
      // Rename new index to production name
      await tx.execute(sql`ALTER INDEX idx_clinical_snapshots_new_record RENAME TO idx_clinical_snapshots_record`);
      console.log('[MIGRATION] Renamed idx_clinical_snapshots_new_record → idx_clinical_snapshots_record');
    });
    
    console.log('[MIGRATION] ✅ Tables swapped successfully!');
    console.log('[MIGRATION] Legacy table and index kept for rollback');
    
    return { success: true };
    
  } catch (error) {
    console.error('[MIGRATION] ❌ Table swap failed:', error);
    throw error;
  }
}

export async function rollbackMigration() {
  console.log('[MIGRATION] Rolling back migration...');
  
  try {
    await db.transaction(async (tx) => {
      // Check if legacy table exists
      const legacyExists = await tx.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'clinical_snapshots_legacy'
        )
      `);
      
      if (!legacyExists.rows[0].exists) {
        throw new Error('Legacy table not found! Cannot rollback.');
      }
      
      // Drop new table
      await tx.execute(sql`DROP TABLE IF EXISTS clinical_snapshots CASCADE`);
      console.log('[MIGRATION] Dropped clinical_snapshots');
      
      // Restore legacy table
      await tx.execute(sql`ALTER TABLE clinical_snapshots_legacy RENAME TO clinical_snapshots`);
      console.log('[MIGRATION] Restored clinical_snapshots_legacy → clinical_snapshots');
    });
    
    console.log('[MIGRATION] ✅ Rollback completed successfully!');
    
    return { success: true };
    
  } catch (error) {
    console.error('[MIGRATION] ❌ Rollback failed:', error);
    throw error;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await migrateVitalsData();
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  })();
}
