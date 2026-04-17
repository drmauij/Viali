-- Migration: 0220_treatments
-- Adds treatments, treatment_lines, treatment_item_configs tables
-- and appointmentId column to surgeries.
-- All statements are idempotent (safe to run multiple times).

-- ========== treatments ==========
CREATE TABLE IF NOT EXISTS "treatments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL,
  "unit_id" varchar,
  "patient_id" varchar NOT NULL,
  "appointment_id" varchar,
  "provider_id" varchar NOT NULL,
  "performed_at" timestamptz NOT NULL,
  "status" varchar NOT NULL DEFAULT 'draft',
  "signature" text,
  "signed_by" varchar,
  "signed_at" timestamptz,
  "amended_by" varchar,
  "amended_at" timestamptz,
  "invoice_id" varchar,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_hospital_id_hospitals_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_unit_id_units_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_patient_id_patients_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_appointment_id_clinic_appointments_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_appointment_id_clinic_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "clinic_appointments"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_provider_id_users_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_signed_by_users_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_amended_by_users_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_amended_by_users_id_fk" FOREIGN KEY ("amended_by") REFERENCES "users"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_invoice_id_clinic_invoices_id_fk' AND conrelid = 'treatments'::regclass) THEN
    ALTER TABLE "treatments" ADD CONSTRAINT "treatments_invoice_id_clinic_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "clinic_invoices"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_treatments_hospital" ON "treatments"("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_treatments_patient_performed" ON "treatments"("patient_id", "performed_at");
CREATE INDEX IF NOT EXISTS "idx_treatments_appointment" ON "treatments"("appointment_id");

-- ========== treatment_lines ==========
CREATE TABLE IF NOT EXISTS "treatment_lines" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "treatment_id" varchar NOT NULL,
  "service_id" varchar,
  "item_id" varchar,
  "lot_id" varchar,
  "lot_number" varchar,
  "dose" varchar,
  "dose_unit" varchar,
  "zones" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "unit_price" decimal(10, 2),
  "total" decimal(10, 2),
  "line_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_lines_treatment_id_treatments_id_fk' AND conrelid = 'treatment_lines'::regclass) THEN
    ALTER TABLE "treatment_lines" ADD CONSTRAINT "treatment_lines_treatment_id_treatments_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_lines_service_id_clinic_services_id_fk' AND conrelid = 'treatment_lines'::regclass) THEN
    ALTER TABLE "treatment_lines" ADD CONSTRAINT "treatment_lines_service_id_clinic_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "clinic_services"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_lines_item_id_items_id_fk' AND conrelid = 'treatment_lines'::regclass) THEN
    ALTER TABLE "treatment_lines" ADD CONSTRAINT "treatment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_lines_lot_id_lots_id_fk' AND conrelid = 'treatment_lines'::regclass) THEN
    ALTER TABLE "treatment_lines" ADD CONSTRAINT "treatment_lines_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Apply CHECK constraint via DO $$ so it is added even when the table already exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_lines_service_or_item_check' AND conrelid = 'treatment_lines'::regclass) THEN
    ALTER TABLE "treatment_lines" ADD CONSTRAINT "treatment_lines_service_or_item_check" CHECK ("service_id" IS NOT NULL OR "item_id" IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_treatment_lines_treatment" ON "treatment_lines"("treatment_id", "line_order");
CREATE INDEX IF NOT EXISTS "idx_treatment_lines_item" ON "treatment_lines"("item_id");

-- ========== treatment_item_configs ==========
CREATE TABLE IF NOT EXISTS "treatment_item_configs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL,
  "unit_id" varchar,
  "item_id" varchar NOT NULL,
  "default_service_id" varchar,
  "default_dose" varchar,
  "default_dose_unit" varchar,
  "default_zones" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "on_demand_only" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_item_configs_hospital_id_hospitals_id_fk' AND conrelid = 'treatment_item_configs'::regclass) THEN
    ALTER TABLE "treatment_item_configs" ADD CONSTRAINT "treatment_item_configs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_item_configs_unit_id_units_id_fk' AND conrelid = 'treatment_item_configs'::regclass) THEN
    ALTER TABLE "treatment_item_configs" ADD CONSTRAINT "treatment_item_configs_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_item_configs_item_id_items_id_fk' AND conrelid = 'treatment_item_configs'::regclass) THEN
    ALTER TABLE "treatment_item_configs" ADD CONSTRAINT "treatment_item_configs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_item_configs_default_service_id_clinic_services_id_fk' AND conrelid = 'treatment_item_configs'::regclass) THEN
    ALTER TABLE "treatment_item_configs" ADD CONSTRAINT "treatment_item_configs_default_service_id_clinic_services_id_fk" FOREIGN KEY ("default_service_id") REFERENCES "clinic_services"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_treatment_item_configs_hospital_item" ON "treatment_item_configs"("hospital_id", "item_id");

-- ========== surgeries.appointment_id ==========
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "appointment_id" varchar;
CREATE INDEX IF NOT EXISTS "idx_surgeries_appointment" ON "surgeries"("appointment_id");

-- Fix surgeries.appointment_id FK: ensure ON DELETE SET NULL (spec requirement)
-- Drop legacy auto-named FK if it exists (from earlier inline REFERENCES bug)
-- Drop any variant of the canonical name without SET NULL, then re-add correctly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeries_appointment_id_fkey' AND conrelid = 'surgeries'::regclass) THEN
    ALTER TABLE "surgeries" DROP CONSTRAINT "surgeries_appointment_id_fkey";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'surgeries_appointment_id_clinic_appointments_id_fk'
      AND conrelid = 'surgeries'::regclass
      AND confdeltype <> 'n'
  ) THEN
    ALTER TABLE "surgeries" DROP CONSTRAINT "surgeries_appointment_id_clinic_appointments_id_fk";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeries_appointment_id_clinic_appointments_id_fk' AND conrelid = 'surgeries'::regclass) THEN
    ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_appointment_id_clinic_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "clinic_appointments"("id") ON DELETE SET NULL;
  END IF;
END $$;
