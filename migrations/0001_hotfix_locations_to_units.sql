-- Hotfix migration: Rename locations table to units
-- This fixes the schema mismatch between code and database

-- Step 1: Rename the table
ALTER TABLE IF EXISTS "locations" RENAME TO "units";

-- Step 2: Ensure all columns exist with correct types
-- (If locations already has these columns, this will be a no-op)
DO $$ 
BEGIN
    -- Add type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'units' AND column_name = 'type') THEN
        ALTER TABLE "units" ADD COLUMN "type" varchar;
    END IF;
    
    -- Add parent_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'units' AND column_name = 'parent_id') THEN
        ALTER TABLE "units" ADD COLUMN "parent_id" varchar;
    END IF;
    
    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'units' AND column_name = 'created_at') THEN
        ALTER TABLE "units" ADD COLUMN "created_at" timestamp DEFAULT now();
    END IF;
END $$;

-- Step 3: Update foreign key references if they exist
-- Note: Only run if there are FK constraints pointing to the old "locations" table

-- Update user_hospital_roles FK if it references locations
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_hospital_roles' AND column_name = 'location_id') THEN
        ALTER TABLE "user_hospital_roles" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
END $$;

-- Update any other tables that might reference location_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'folders' AND column_name = 'location_id') THEN
        ALTER TABLE "folders" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'items' AND column_name = 'location_id') THEN
        ALTER TABLE "items" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'lots' AND column_name = 'location_id') THEN
        ALTER TABLE "lots" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'stock_levels' AND column_name = 'location_id') THEN
        ALTER TABLE "stock_levels" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'activities' AND column_name = 'location_id') THEN
        ALTER TABLE "activities" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'controlled_checks' AND column_name = 'location_id') THEN
        ALTER TABLE "controlled_checks" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'import_jobs' AND column_name = 'location_id') THEN
        ALTER TABLE "import_jobs" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'checklist_templates' AND column_name = 'location_id') THEN
        ALTER TABLE "checklist_templates" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'checklist_completions' AND column_name = 'location_id') THEN
        ALTER TABLE "checklist_completions" RENAME COLUMN "location_id" TO "unit_id";
    END IF;
END $$;

-- Step 4: Recreate indexes with correct table name
DROP INDEX IF EXISTS "idx_units_hospital";
DROP INDEX IF EXISTS "idx_units_parent";
CREATE INDEX IF NOT EXISTS "idx_units_hospital" ON "units" ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_units_parent" ON "units" ("parent_id");

-- Step 5: Update hospitals table FK references if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'hospitals' AND column_name = 'anesthesia_location_id') THEN
        ALTER TABLE "hospitals" RENAME COLUMN "anesthesia_location_id" TO "anesthesia_unit_id";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'hospitals' AND column_name = 'surgery_location_id') THEN
        ALTER TABLE "hospitals" RENAME COLUMN "surgery_location_id" TO "surgery_unit_id";
    END IF;
END $$;
