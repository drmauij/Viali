DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'units' AND column_name = 'is_business_module') THEN
    ALTER TABLE "units" ADD COLUMN "is_business_module" boolean DEFAULT false;
  END IF;
END $$;
