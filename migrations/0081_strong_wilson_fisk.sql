DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'pre_surgery_reminder_disabled') THEN
    ALTER TABLE "hospitals" ADD COLUMN "pre_surgery_reminder_disabled" boolean DEFAULT false;
  END IF;
END $$;
