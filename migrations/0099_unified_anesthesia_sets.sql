-- Migration: Add medication and inventory junction tables to unified anesthesia sets
-- This migration is idempotent (safe to run multiple times)

-- Create anesthesia_set_medications table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anesthesia_set_medications') THEN
    CREATE TABLE anesthesia_set_medications (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      set_id VARCHAR NOT NULL REFERENCES anesthesia_sets(id) ON DELETE CASCADE,
      medication_config_id VARCHAR NOT NULL REFERENCES medication_configs(id) ON DELETE CASCADE,
      custom_dose VARCHAR,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  END IF;
END $$;

-- Create indexes for anesthesia_set_medications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_anesthesia_set_medications_set') THEN
    CREATE INDEX idx_anesthesia_set_medications_set ON anesthesia_set_medications(set_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_anesthesia_set_medications_config') THEN
    CREATE INDEX idx_anesthesia_set_medications_config ON anesthesia_set_medications(medication_config_id);
  END IF;
END $$;

-- Add unique constraint for set + medication config
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'uq_anesthesia_set_medication') THEN
    ALTER TABLE anesthesia_set_medications ADD CONSTRAINT uq_anesthesia_set_medication UNIQUE (set_id, medication_config_id);
  END IF;
END $$;

-- Create anesthesia_set_inventory table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anesthesia_set_inventory') THEN
    CREATE TABLE anesthesia_set_inventory (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      set_id VARCHAR NOT NULL REFERENCES anesthesia_sets(id) ON DELETE CASCADE,
      item_id VARCHAR NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  END IF;
END $$;

-- Create indexes for anesthesia_set_inventory
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_anesthesia_set_inventory_set') THEN
    CREATE INDEX idx_anesthesia_set_inventory_set ON anesthesia_set_inventory(set_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_anesthesia_set_inventory_item') THEN
    CREATE INDEX idx_anesthesia_set_inventory_item ON anesthesia_set_inventory(item_id);
  END IF;
END $$;

-- Add unique constraint for set + item
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'uq_anesthesia_set_inventory') THEN
    ALTER TABLE anesthesia_set_inventory ADD CONSTRAINT uq_anesthesia_set_inventory UNIQUE (set_id, item_id);
  END IF;
END $$;
