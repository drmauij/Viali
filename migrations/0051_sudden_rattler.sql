DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='timebutler_ics_url') THEN
    ALTER TABLE "users" ADD COLUMN "timebutler_ics_url" varchar;
  END IF;
END $$;