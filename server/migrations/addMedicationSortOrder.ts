import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Migration script to add sortOrder column to medication_configs table
 * This allows users to customize the order of medications within administration groups
 */

export async function addMedicationSortOrder() {
  console.log('[MIGRATION] Adding sortOrder column to medication_configs...');
  
  try {
    // Add sortOrder column with default value of 0
    await db.execute(sql`
      ALTER TABLE medication_configs 
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0
    `);
    
    console.log('[MIGRATION] ✅ sortOrder column added successfully!');
    
    return { success: true };
    
  } catch (error) {
    console.error('[MIGRATION] ❌ Migration failed:', error);
    throw error;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await addMedicationSortOrder();
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  })();
}
