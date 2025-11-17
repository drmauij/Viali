-- Migration: Redesign clinical_snapshots to store vitals as arrays with point IDs
-- Strategy: Two-phase migration for safety (create new, migrate, swap, keep legacy)

-- Phase 1: Create new table structure
CREATE TABLE IF NOT EXISTS "clinical_snapshots_new" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "anesthesia_record_id" varchar NOT NULL UNIQUE REFERENCES "anesthesia_records"("id") ON DELETE CASCADE,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add index on anesthesia_record_id
CREATE INDEX IF NOT EXISTS "idx_clinical_snapshots_new_record" ON "clinical_snapshots_new"("anesthesia_record_id");

-- Phase 2: Data migration will be done via TypeScript script
-- (See server/migrations/migrateVitalsData.ts)

-- Phase 3: After verification, swap tables
-- This will be done programmatically:
-- 1. Rename clinical_snapshots → clinical_snapshots_legacy
-- 2. Rename clinical_snapshots_new → clinical_snapshots
-- 3. Keep legacy table for rollback

-- Note: The actual table swap and data migration will be executed by the migration script
-- This ensures we can verify data integrity before committing the change
