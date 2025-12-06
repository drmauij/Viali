-- Add hourly_rate column to users table (idempotent - safe to run multiple times)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'hourly_rate'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "hourly_rate" numeric(10, 2);
  END IF;
END $$;
