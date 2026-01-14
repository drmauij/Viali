DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_hospital_roles' AND column_name = 'availability_mode'
  ) THEN
    ALTER TABLE "user_hospital_roles" ADD COLUMN "availability_mode" varchar DEFAULT 'always_available';
  END IF;
END $$;