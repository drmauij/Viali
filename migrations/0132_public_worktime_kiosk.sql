-- Add kiosk_token column to hospitals table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hospitals' AND column_name = 'kiosk_token'
  ) THEN
    ALTER TABLE "hospitals" ADD COLUMN "kiosk_token" varchar;
  END IF;
END $$;

-- Add unique constraint on kiosk_token
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'hospitals_kiosk_token_unique'
  ) THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_kiosk_token_unique" UNIQUE("kiosk_token");
  END IF;
END $$;

-- Add kiosk_pin_hash column to users table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'kiosk_pin_hash'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "kiosk_pin_hash" varchar;
  END IF;
END $$;
