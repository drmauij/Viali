-- Migration: 0224_service_folders
-- Adds service_folders table and folder_id column on clinic_services.
-- All statements are idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS "service_folders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL,
  "unit_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_folders_hospital_id_hospitals_id_fk' AND conrelid = 'service_folders'::regclass) THEN
    ALTER TABLE "service_folders" ADD CONSTRAINT "service_folders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_folders_unit_id_units_id_fk' AND conrelid = 'service_folders'::regclass) THEN
    ALTER TABLE "service_folders" ADD CONSTRAINT "service_folders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_service_folders_hospital" ON "service_folders" ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_service_folders_unit" ON "service_folders" ("unit_id");

ALTER TABLE "clinic_services" ADD COLUMN IF NOT EXISTS "folder_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_services_folder_id_service_folders_id_fk' AND conrelid = 'clinic_services'::regclass) THEN
    ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_folder_id_service_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "service_folders"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_clinic_services_folder" ON "clinic_services" ("folder_id");
