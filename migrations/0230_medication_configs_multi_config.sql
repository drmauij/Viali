-- Option 3 migration: true multi-config per item.
-- - Drop UNIQUE(item_id) on medication_configs.
-- - Add composite UNIQUE(item_id, administration_group) so an item can have N configs, one per admin group.
-- - Add medication_config_id column on anesthesia_medications so each dose knows its lane.
-- - Backfill existing dose rows (every existing item has exactly one config pre-migration).

-- Step A: drop the single-column unique constraint.
ALTER TABLE medication_configs
  DROP CONSTRAINT IF EXISTS medication_configs_item_id_unique;

-- Step B: add the composite unique index (partial — only when admin group is set).
CREATE UNIQUE INDEX IF NOT EXISTS uq_medication_configs_item_group
  ON medication_configs (item_id, administration_group)
  WHERE administration_group IS NOT NULL;

-- Step C: add medication_config_id column on anesthesia_medications.
ALTER TABLE anesthesia_medications
  ADD COLUMN IF NOT EXISTS medication_config_id varchar;

-- Step D: add the FK (guarded — Postgres can't IF NOT EXISTS on constraints directly).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'anesthesia_medications_medication_config_id_medication_configs_fk'
  ) THEN
    ALTER TABLE anesthesia_medications
      ADD CONSTRAINT anesthesia_medications_medication_config_id_medication_configs_fk
      FOREIGN KEY (medication_config_id)
      REFERENCES medication_configs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Step E: index for lookup.
CREATE INDEX IF NOT EXISTS idx_anesthesia_medications_config
  ON anesthesia_medications (medication_config_id);

-- Step F: backfill existing dose rows. Every existing item has exactly one config
-- (because the unique constraint we just dropped guaranteed it), so the lookup is
-- unambiguous. Only touches rows where medication_config_id is NULL (idempotent).
UPDATE anesthesia_medications AS am
SET medication_config_id = mc.id
FROM medication_configs AS mc
WHERE mc.item_id = am.item_id
  AND am.medication_config_id IS NULL;
