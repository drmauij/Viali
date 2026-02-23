DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hospitals' AND column_name = 'external_surgery_notification_email'
  ) THEN
    ALTER TABLE "hospitals" ADD COLUMN "external_surgery_notification_email" varchar;
  END IF;
END $$;
