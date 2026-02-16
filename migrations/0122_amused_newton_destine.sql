DO $$ BEGIN
  -- Make surgery_name nullable on external_surgery_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_surgery_requests' AND column_name = 'surgery_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "external_surgery_requests" ALTER COLUMN "surgery_name" DROP NOT NULL;
  END IF;

  -- Make patient_first_name nullable on external_surgery_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_surgery_requests' AND column_name = 'patient_first_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "external_surgery_requests" ALTER COLUMN "patient_first_name" DROP NOT NULL;
  END IF;

  -- Make patient_last_name nullable on external_surgery_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_surgery_requests' AND column_name = 'patient_last_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "external_surgery_requests" ALTER COLUMN "patient_last_name" DROP NOT NULL;
  END IF;

  -- Make patient_birthday nullable on external_surgery_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_surgery_requests' AND column_name = 'patient_birthday' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "external_surgery_requests" ALTER COLUMN "patient_birthday" DROP NOT NULL;
  END IF;

  -- Make patient_phone nullable on external_surgery_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_surgery_requests' AND column_name = 'patient_phone' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "external_surgery_requests" ALTER COLUMN "patient_phone" DROP NOT NULL;
  END IF;

  -- Make patient_id nullable on surgeries
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surgeries' AND column_name = 'patient_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "surgeries" ALTER COLUMN "patient_id" DROP NOT NULL;
  END IF;

  -- Make planned_surgery nullable on surgeries
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surgeries' AND column_name = 'planned_surgery' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "surgeries" ALTER COLUMN "planned_surgery" DROP NOT NULL;
  END IF;

  -- Add is_reservation_only column to external_surgery_requests
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_surgery_requests' AND column_name = 'is_reservation_only'
  ) THEN
    ALTER TABLE "external_surgery_requests" ADD COLUMN "is_reservation_only" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
