-- Add activity_type column to external_worklog_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'external_worklog_entries' AND column_name = 'activity_type'
  ) THEN
    ALTER TABLE "external_worklog_entries" ADD COLUMN "activity_type" varchar DEFAULT 'other';
    UPDATE "external_worklog_entries" SET "activity_type" = 'other' WHERE "activity_type" IS NULL;
    ALTER TABLE "external_worklog_entries" ALTER COLUMN "activity_type" SET NOT NULL;
  END IF;
END $$;
