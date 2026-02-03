-- CHOP Procedures table for Swiss surgical procedure classification
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chop_procedures') THEN
    CREATE TABLE "chop_procedures" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "code" varchar NOT NULL,
      "description_de" text NOT NULL,
      "description_fr" text,
      "chapter" varchar,
      "indent_level" integer,
      "is_codeable" boolean DEFAULT true NOT NULL,
      "laterality" varchar,
      "version" varchar DEFAULT '2026' NOT NULL,
      "created_at" timestamp DEFAULT now(),
      CONSTRAINT "chop_procedures_code_unique" UNIQUE("code")
    );
  END IF;
END $$;

-- Add chop_code column to surgeries table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'chop_code') THEN
    ALTER TABLE "surgeries" ADD COLUMN "chop_code" varchar;
  END IF;
END $$;

-- Index on CHOP code
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chop_procedures_code') THEN
    CREATE INDEX "idx_chop_procedures_code" ON "chop_procedures" USING btree ("code");
  END IF;
END $$;

-- Full-text search index for German descriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_chop_procedures_description') THEN
    CREATE INDEX "idx_chop_procedures_description" ON "chop_procedures" USING gin (to_tsvector('german', "description_de"));
  END IF;
END $$;
