-- 0263_recovery_timestamps_with_tz.sql
-- Promote recovery_cases.* + recovery_case_contacts.created_at to
-- TIMESTAMP WITH TIME ZONE so the JSON serialization returns ISO strings
-- with the Z marker. Existing values are stored as UTC by the app (NOW()
-- in Postgres returns UTC when the server tz is UTC, which is the default
-- on managed Postgres), so the AT TIME ZONE 'UTC' interpretation matches
-- what was written.
-- Idempotent: skips columns that are already TIMESTAMPTZ.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recovery_cases' AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE recovery_cases
      ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recovery_cases' AND column_name = 'updated_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE recovery_cases
      ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE USING updated_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recovery_cases' AND column_name = 'closed_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE recovery_cases
      ALTER COLUMN closed_at TYPE TIMESTAMP WITH TIME ZONE USING closed_at AT TIME ZONE 'UTC';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recovery_case_contacts' AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE recovery_case_contacts
      ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;
