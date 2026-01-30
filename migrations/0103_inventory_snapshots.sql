-- Inventory snapshots for historical tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_snapshots') THEN
    CREATE TABLE inventory_snapshots (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      hospital_id varchar NOT NULL REFERENCES hospitals(id),
      unit_id varchar NOT NULL REFERENCES units(id),
      snapshot_date date NOT NULL,
      total_value decimal(14, 2) NOT NULL,
      item_count integer NOT NULL,
      created_at timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Add indexes for efficient querying
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_inventory_snapshots_hospital_date') THEN
    CREATE INDEX idx_inventory_snapshots_hospital_date ON inventory_snapshots(hospital_id, snapshot_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_inventory_snapshots_unit_date') THEN
    CREATE INDEX idx_inventory_snapshots_unit_date ON inventory_snapshots(unit_id, snapshot_date);
  END IF;
END $$;
