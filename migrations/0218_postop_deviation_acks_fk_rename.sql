-- Migration 0218: stabilize postop_deviation_acknowledgments FK constraint name
-- Migration 0215 used drizzle's auto-generated FK name which exceeded PG's 63-char
-- identifier limit and got truncated to "..._anesthesi". That causes drizzle-kit push
-- to see an infinite diff (it tries to "fix" the name, PG truncates it again, repeat).
-- Fix: rename to a short stable name that PG won't truncate and that schema.ts can pin.
-- Idempotent: safe to run multiple times.

DO $$
DECLARE old_name text;
BEGIN
  SELECT conname INTO old_name
  FROM pg_constraint
  WHERE conrelid = 'postop_deviation_acknowledgments'::regclass
    AND contype  = 'f'
    AND conkey   = (
      SELECT array_agg(a.attnum ORDER BY a.attnum)
      FROM pg_attribute a
      WHERE a.attrelid = 'postop_deviation_acknowledgments'::regclass
        AND a.attname  = ANY(ARRAY['anesthesia_record_id'])
    );
  IF old_name IS NOT NULL AND old_name <> 'deviation_ack_anesthesia_record_id_fk' THEN
    EXECUTE format('ALTER TABLE postop_deviation_acknowledgments DROP CONSTRAINT %I', old_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'deviation_ack_anesthesia_record_id_fk'
      AND conrelid = 'postop_deviation_acknowledgments'::regclass
  ) THEN
    ALTER TABLE postop_deviation_acknowledgments
      ADD CONSTRAINT deviation_ack_anesthesia_record_id_fk
      FOREIGN KEY (anesthesia_record_id)
      REFERENCES anesthesia_records(id)
      ON DELETE CASCADE;
  END IF;
END $$;
