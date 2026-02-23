-- Migration: Remove unit-scoping from worklog links, make hospital-wide
-- Each external worker should have ONE link per hospital, not per unit.

-- Step 1: Deduplicate — keep the oldest link per (hospital_id, email)
DO $$ BEGIN
  DELETE FROM external_worklog_links
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY hospital_id, LOWER(email)
          ORDER BY created_at ASC
        ) AS rn
      FROM external_worklog_links
    ) sub
    WHERE sub.rn > 1
  );
END $$;

-- Step 2: Drop the old unit+email unique constraint (if exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idx_external_worklog_links_unit_email'
  ) THEN
    ALTER TABLE "external_worklog_links" DROP CONSTRAINT "idx_external_worklog_links_unit_email";
  END IF;
END $$;

-- Step 3: Add hospital+email unique constraint (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idx_external_worklog_links_hospital_email'
  ) THEN
    ALTER TABLE "external_worklog_links"
      ADD CONSTRAINT "idx_external_worklog_links_hospital_email"
      UNIQUE ("hospital_id", "email");
  END IF;
END $$;
