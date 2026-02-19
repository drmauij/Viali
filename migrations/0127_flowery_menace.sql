DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'brief_signature'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "brief_signature" text;
  END IF;
END $$;
