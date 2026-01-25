-- Migration: Add medication sets for quick import of medication bundles
-- This migration is idempotent (safe to run multiple times)

-- Create medication_sets table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medication_sets') THEN
    CREATE TABLE medication_sets (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR NOT NULL,
      description TEXT,
      hospital_id VARCHAR NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
      unit_id VARCHAR REFERENCES units(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR REFERENCES users(id)
    );
  END IF;
END $$;

-- Create indexes for medication_sets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_medication_sets_hospital') THEN
    CREATE INDEX idx_medication_sets_hospital ON medication_sets(hospital_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_medication_sets_unit') THEN
    CREATE INDEX idx_medication_sets_unit ON medication_sets(unit_id);
  END IF;
END $$;

-- Create medication_set_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medication_set_items') THEN
    CREATE TABLE medication_set_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      set_id VARCHAR NOT NULL REFERENCES medication_sets(id) ON DELETE CASCADE,
      medication_config_id VARCHAR NOT NULL REFERENCES medication_configs(id) ON DELETE CASCADE,
      custom_dose VARCHAR,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  END IF;
END $$;

-- Create indexes for medication_set_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_medication_set_items_set') THEN
    CREATE INDEX idx_medication_set_items_set ON medication_set_items(set_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_medication_set_items_config') THEN
    CREATE INDEX idx_medication_set_items_config ON medication_set_items(medication_config_id);
  END IF;
END $$;

-- Add unique constraint for set + medication config
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'uq_medication_set_item') THEN
    ALTER TABLE medication_set_items ADD CONSTRAINT uq_medication_set_item UNIQUE (set_id, medication_config_id);
  END IF;
END $$;
