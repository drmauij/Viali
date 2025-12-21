DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='preferences') THEN
    ALTER TABLE "users" ADD COLUMN "preferences" jsonb;
  END IF;
END $$;