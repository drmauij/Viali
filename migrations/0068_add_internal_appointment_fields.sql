-- Add internal appointment fields to clinic_appointments table
DO $$
BEGIN
  -- Add appointment_type column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinic_appointments' AND column_name = 'appointment_type') THEN
    ALTER TABLE clinic_appointments ADD COLUMN appointment_type varchar DEFAULT 'external' NOT NULL;
  END IF;

  -- Add internal_colleague_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinic_appointments' AND column_name = 'internal_colleague_id') THEN
    ALTER TABLE clinic_appointments ADD COLUMN internal_colleague_id varchar REFERENCES users(id);
  END IF;

  -- Add internal_subject column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinic_appointments' AND column_name = 'internal_subject') THEN
    ALTER TABLE clinic_appointments ADD COLUMN internal_subject varchar;
  END IF;

  -- Make patient_id nullable (for internal appointments)
  -- Note: This is complex as it involves changing NOT NULL constraint
  -- First check if it's currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clinic_appointments' 
    AND column_name = 'patient_id' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE clinic_appointments ALTER COLUMN patient_id DROP NOT NULL;
  END IF;
END $$;
