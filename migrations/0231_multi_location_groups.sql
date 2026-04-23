-- Multi-location groups: brand/chain layer above hospitals.
-- All statements are idempotent per repo convention.

-- 1. hospital_groups
CREATE TABLE IF NOT EXISTS hospital_groups (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  booking_token varchar UNIQUE,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
);

-- 2. hospitals.group_id
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS group_id varchar;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospitals_group_id_fkey') THEN
    ALTER TABLE hospitals ADD CONSTRAINT hospitals_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES hospital_groups(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_hospitals_group ON hospitals(group_id);

-- 3. patient_hospitals
CREATE TABLE IF NOT EXISTS patient_hospitals (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id varchar NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id varchar NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  added_at timestamp DEFAULT NOW(),
  added_by varchar REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_patient_hospital ON patient_hospitals(patient_id, hospital_id);
-- The unique index above is leftmost-prefix on patient_id, so a separate
-- single-column index would be dead weight. Drop it for existing installs
-- that ran an earlier version of this migration.
DROP INDEX IF EXISTS idx_patient_hospitals_patient;
CREATE INDEX IF NOT EXISTS idx_patient_hospitals_hospital ON patient_hospitals(hospital_id);

-- 4. Backfill patient_hospitals from existing patients (idempotent).
INSERT INTO patient_hospitals (patient_id, hospital_id)
SELECT id, hospital_id FROM patients
ON CONFLICT (patient_id, hospital_id) DO NOTHING;

-- 5. users.is_platform_admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean DEFAULT false NOT NULL;

-- 6. clinic_services hybrid ownership (hospital_id OR group_id, never both, never neither).
ALTER TABLE clinic_services ALTER COLUMN hospital_id DROP NOT NULL;
ALTER TABLE clinic_services ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE clinic_services ADD COLUMN IF NOT EXISTS group_id varchar;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_services_group_id_fkey') THEN
    ALTER TABLE clinic_services ADD CONSTRAINT clinic_services_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES hospital_groups(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_services_owner_xor_check') THEN
    ALTER TABLE clinic_services ADD CONSTRAINT clinic_services_owner_xor_check
      CHECK ((hospital_id IS NOT NULL) <> (group_id IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_clinic_services_group ON clinic_services(group_id);

-- 7. patient_edit_audit (cross-location clinical edits log)
CREATE TABLE IF NOT EXISTS patient_edit_audit (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id varchar NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  editing_user_id varchar NOT NULL REFERENCES users(id),
  editing_hospital_id varchar NOT NULL REFERENCES hospitals(id),
  field varchar NOT NULL,
  old_value text,
  new_value text,
  edited_at timestamp DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_edit_audit_patient ON patient_edit_audit(patient_id, edited_at DESC);
