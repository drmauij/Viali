-- Add HIN Articles table for Swiss medication database
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hin_articles') THEN
    CREATE TABLE "hin_articles" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "pharmacode" varchar,
      "gtin" varchar,
      "swissmedic_no" varchar,
      "product_no" varchar,
      "description_de" text NOT NULL,
      "description_fr" text,
      "pexf" numeric(10, 2),
      "ppub" numeric(10, 2),
      "price_valid_from" date,
      "smcat" varchar,
      "sale_code" varchar,
      "vat" varchar,
      "is_refdata" boolean DEFAULT false,
      "company_gln" varchar,
      "last_updated" timestamp DEFAULT now()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hin_sync_status') THEN
    CREATE TABLE "hin_sync_status" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "last_sync_at" timestamp,
      "articles_count" integer DEFAULT 0,
      "sync_duration_ms" integer,
      "status" varchar DEFAULT 'idle',
      "error_message" text,
      "created_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Add personal data fields to external_worklog_links
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'external_worklog_links' AND column_name = 'first_name') THEN
    ALTER TABLE "external_worklog_links" ADD COLUMN "first_name" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'external_worklog_links' AND column_name = 'last_name') THEN
    ALTER TABLE "external_worklog_links" ADD COLUMN "last_name" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'external_worklog_links' AND column_name = 'address') THEN
    ALTER TABLE "external_worklog_links" ADD COLUMN "address" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'external_worklog_links' AND column_name = 'city') THEN
    ALTER TABLE "external_worklog_links" ADD COLUMN "city" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'external_worklog_links' AND column_name = 'zip') THEN
    ALTER TABLE "external_worklog_links" ADD COLUMN "zip" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'external_worklog_links' AND column_name = 'bank_account') THEN
    ALTER TABLE "external_worklog_links" ADD COLUMN "bank_account" varchar;
  END IF;
END $$;

-- Add indexes for HIN articles
CREATE INDEX IF NOT EXISTS "idx_hin_articles_pharmacode" ON "hin_articles" USING btree ("pharmacode");
CREATE INDEX IF NOT EXISTS "idx_hin_articles_gtin" ON "hin_articles" USING btree ("gtin");
CREATE INDEX IF NOT EXISTS "idx_hin_articles_swissmedic" ON "hin_articles" USING btree ("swissmedic_no");
