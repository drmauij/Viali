-- Rename enums
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meta_lead_status') THEN
    ALTER TYPE "meta_lead_status" RENAME TO "lead_status";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meta_lead_contact_outcome') THEN
    ALTER TYPE "meta_lead_contact_outcome" RENAME TO "lead_contact_outcome";
  END IF;
END $$;

-- Rename tables
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_leads') THEN
    ALTER TABLE "meta_leads" RENAME TO "leads";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_lead_contacts') THEN
    ALTER TABLE "meta_lead_contacts" RENAME TO "lead_contacts";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_lead_webhook_config') THEN
    ALTER TABLE "meta_lead_webhook_config" RENAME TO "lead_webhook_config";
  END IF;
END $$;

-- Rename indexes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'meta_leads_hospital_status_created') THEN
    ALTER INDEX "meta_leads_hospital_status_created" RENAME TO "leads_hospital_status_created";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'meta_leads_hospital_lead_id') THEN
    ALTER INDEX "meta_leads_hospital_lead_id" RENAME TO "leads_hospital_lead_id";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'meta_lead_contacts_lead_created') THEN
    ALTER INDEX "meta_lead_contacts_lead_created" RENAME TO "lead_contacts_lead_created";
  END IF;
END $$;

-- Rename FK column in lead_contacts (meta_lead_id -> lead_id)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_contacts' AND column_name = 'meta_lead_id'
  ) THEN
    ALTER TABLE "lead_contacts" RENAME COLUMN "meta_lead_id" TO "lead_id";
  END IF;
END $$;

-- Make meta-specific columns nullable for non-meta leads
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'meta_lead_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "leads" ALTER COLUMN "meta_lead_id" DROP NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'meta_form_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "leads" ALTER COLUMN "meta_form_id" DROP NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'operation' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "leads" ALTER COLUMN "operation" DROP NOT NULL;
  END IF;
END $$;

-- Add message column
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "message" text;

-- Add UTM tracking columns
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_source" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_medium" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_campaign" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_term" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "utm_content" varchar;

-- Add click ID columns
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gclid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gbraid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "wbraid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "fbclid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ttclid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "msclkid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "igshid" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "li_fat_id" varchar;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "twclid" varchar;

-- Update unique index: make it conditional (only for non-null meta_lead_id)
DROP INDEX IF EXISTS "leads_hospital_lead_id";
CREATE UNIQUE INDEX IF NOT EXISTS "leads_hospital_meta_lead_id" ON "leads" ("hospital_id", "meta_lead_id") WHERE "meta_lead_id" IS NOT NULL;
