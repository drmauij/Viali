DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'items' AND column_name = 'daily_usage_estimate'
  ) THEN
    ALTER TABLE "items" ADD COLUMN "daily_usage_estimate" numeric(10, 2);
  END IF;
END $$;