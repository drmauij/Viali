DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discharge_brief_templates'
      AND column_name = 'brief_type'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "discharge_brief_templates" ALTER COLUMN "brief_type" DROP NOT NULL;
  END IF;
END $$;
