-- Add isBookable column to user_hospital_roles (idempotent)
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_hospital_roles' 
    AND column_name = 'is_bookable'
  ) THEN 
    ALTER TABLE "user_hospital_roles" ADD COLUMN "is_bookable" boolean DEFAULT false;
  END IF;
END $$;
