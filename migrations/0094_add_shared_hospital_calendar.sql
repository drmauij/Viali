-- Add hasOwnCalendar flag to units table
-- When false (default), the unit uses the hospital-level shared calendar
-- When true, the unit has its own calendar with separate providers/availability

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'units' AND column_name = 'has_own_calendar'
  ) THEN
    ALTER TABLE units ADD COLUMN has_own_calendar boolean DEFAULT false;
  END IF;
END $$;

-- Drop unique constraint on clinic_providers since we now allow hospital-level providers
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'unique_clinic_provider' AND table_name = 'clinic_providers'
  ) THEN
    ALTER TABLE clinic_providers DROP CONSTRAINT unique_clinic_provider;
  END IF;
END $$;

-- Make unitId nullable in clinic_providers to allow hospital-level providers
-- Hospital-level providers (unitId = NULL) are shared across all units without hasOwnCalendar

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clinic_providers' AND column_name = 'unit_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE clinic_providers ALTER COLUMN unit_id DROP NOT NULL;
  END IF;
END $$;

-- Add hospitalId to clinic_providers for hospital-level providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clinic_providers' AND column_name = 'hospital_id'
  ) THEN
    ALTER TABLE clinic_providers ADD COLUMN hospital_id varchar REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Make unitId nullable in provider_availability
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_availability' AND column_name = 'unit_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE provider_availability ALTER COLUMN unit_id DROP NOT NULL;
  END IF;
END $$;

-- Add hospitalId to provider_availability for hospital-level availability
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_availability' AND column_name = 'hospital_id'
  ) THEN
    ALTER TABLE provider_availability ADD COLUMN hospital_id varchar REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Make unitId nullable in provider_time_off
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_time_off' AND column_name = 'unit_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE provider_time_off ALTER COLUMN unit_id DROP NOT NULL;
  END IF;
END $$;

-- Add hospitalId to provider_time_off for hospital-level time off
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_time_off' AND column_name = 'hospital_id'
  ) THEN
    ALTER TABLE provider_time_off ADD COLUMN hospital_id varchar REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Make unitId nullable in provider_availability_windows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_availability_windows' AND column_name = 'unit_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE provider_availability_windows ALTER COLUMN unit_id DROP NOT NULL;
  END IF;
END $$;

-- Add hospitalId to provider_availability_windows for hospital-level windows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'provider_availability_windows' AND column_name = 'hospital_id'
  ) THEN
    ALTER TABLE provider_availability_windows ADD COLUMN hospital_id varchar REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add indexes for hospital-level queries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clinic_providers_hospital') THEN
    CREATE INDEX idx_clinic_providers_hospital ON clinic_providers(hospital_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_provider_availability_hospital') THEN
    CREATE INDEX idx_provider_availability_hospital ON provider_availability(hospital_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_provider_time_off_hospital') THEN
    CREATE INDEX idx_provider_time_off_hospital ON provider_time_off(hospital_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_provider_avail_windows_hospital') THEN
    CREATE INDEX idx_provider_avail_windows_hospital ON provider_availability_windows(hospital_id);
  END IF;
END $$;
