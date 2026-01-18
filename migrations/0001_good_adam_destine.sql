DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'medication_configs' AND column_name = 'sort_order') THEN
    ALTER TABLE "medication_configs" ADD COLUMN "sort_order" integer DEFAULT 0;
  END IF;
END $$;
