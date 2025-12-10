-- Add archive fields to patients table (idempotent)
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
    ALTER TABLE "patients" ADD COLUMN "archived_by" varchar;
  END IF;
END $$;

-- Add archive fields to surgeries table (idempotent)
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
    ALTER TABLE "surgeries" ADD COLUMN "archived_by" varchar;
  END IF;
END $$;

-- Add foreign key constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patients_archived_by_users_id_fk') THEN
    ALTER TABLE "patients" ADD CONSTRAINT "patients_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'surgeries_archived_by_users_id_fk') THEN
    ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Add indexes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patients_archived') THEN
    CREATE INDEX "idx_patients_archived" ON "patients" USING btree ("is_archived");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_surgeries_archived') THEN
    CREATE INDEX "idx_surgeries_archived" ON "surgeries" USING btree ("is_archived");
  END IF;
END $$;
