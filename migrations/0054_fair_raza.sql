-- Make price column nullable (idempotent)
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clinic_services' 
    AND column_name = 'price' 
    AND is_nullable = 'NO'
  ) THEN 
    ALTER TABLE "clinic_services" ALTER COLUMN "price" DROP NOT NULL;
  END IF;
END $$;--> statement-breakpoint

-- Remove default from duration_minutes (idempotent)
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clinic_services' 
    AND column_name = 'duration_minutes' 
    AND column_default IS NOT NULL
  ) THEN 
    ALTER TABLE "clinic_services" ALTER COLUMN "duration_minutes" DROP DEFAULT;
  END IF;
END $$;
