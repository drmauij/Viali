-- Add archive fields to patients table (soft delete - patients should never be fully deleted)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'is_archived') THEN
    ALTER TABLE "patients" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'archived_at') THEN
    ALTER TABLE "patients" ADD COLUMN "archived_at" timestamp;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'archived_by') THEN
    ALTER TABLE "patients" ADD COLUMN "archived_by" varchar REFERENCES "users"("id");
  END IF;
END $$;

-- Add index for archived patients
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patients_archived') THEN
    CREATE INDEX "idx_patients_archived" ON "patients" ("is_archived");
  END IF;
END $$;

-- Add archive fields to surgeries table (soft delete - surgeries should never be fully deleted)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'is_archived') THEN
    ALTER TABLE "surgeries" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'archived_at') THEN
    ALTER TABLE "surgeries" ADD COLUMN "archived_at" timestamp;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'archived_by') THEN
    ALTER TABLE "surgeries" ADD COLUMN "archived_by" varchar REFERENCES "users"("id");
  END IF;
END $$;

-- Add index for archived surgeries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_surgeries_archived') THEN
    CREATE INDEX "idx_surgeries_archived" ON "surgeries" ("is_archived");
  END IF;
END $$;
