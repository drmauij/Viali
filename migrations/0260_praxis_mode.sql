-- 0260_praxis_mode.sql
-- Praxis Mode v2: room-based cross-tenant referrals + availability + reschedule alerting.

-- 1. hospitals.tenant_type (clinic | praxis)
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS tenant_type VARCHAR DEFAULT 'clinic';

-- 2. surgery_rooms.linked_hospital_id — non-null marks a room as a logical/external room
ALTER TABLE surgery_rooms ADD COLUMN IF NOT EXISTS linked_hospital_id VARCHAR;

CREATE INDEX IF NOT EXISTS idx_surgery_rooms_linked_hospital ON surgery_rooms(linked_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'surgery_rooms_linked_hospital_id_hospitals_id_fk'
      AND conrelid = 'surgery_rooms'::regclass
  ) THEN
    ALTER TABLE surgery_rooms
      ADD CONSTRAINT surgery_rooms_linked_hospital_id_hospitals_id_fk
      FOREIGN KEY (linked_hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. surgeries: cross-tenant referral + reschedule fields
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS external_request_id VARCHAR;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_status VARCHAR DEFAULT 'local';
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS referral_note TEXT;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS last_clinic_reschedule_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_acknowledged_at TIMESTAMP;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS reschedule_history JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_surgeries_external_request_id ON surgeries(external_request_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_referral_status ON surgeries(referral_status);

-- 4. external_surgery_requests: source back-references + snapshot
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_hospital_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS source_surgery_id VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS patient_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_external_surgery_requests_source_hospital_id
  ON external_surgery_requests(source_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_surgery_requests_source_hospital_id_hospitals_id_fk'
      AND conrelid = 'external_surgery_requests'::regclass
  ) THEN
    ALTER TABLE external_surgery_requests
      ADD CONSTRAINT external_surgery_requests_source_hospital_id_hospitals_id_fk
      FOREIGN KEY (source_hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. patient_questionnaire_responses: praxis-import provenance
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis BOOLEAN DEFAULT false;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_from_praxis_at TIMESTAMP;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS imported_field_sources JSONB;

-- 6. referral_partnerships
CREATE TABLE IF NOT EXISTS referral_partnerships (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hospital_id VARCHAR NOT NULL,
  destination_hospital_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  pairing_source VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_partnerships_source ON referral_partnerships(source_hospital_id);
CREATE INDEX IF NOT EXISTS idx_referral_partnerships_destination ON referral_partnerships(destination_hospital_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_partnerships_unique_pair'
      AND conrelid = 'referral_partnerships'::regclass
  ) THEN
    ALTER TABLE referral_partnerships ADD CONSTRAINT referral_partnerships_unique_pair
      UNIQUE (source_hospital_id, destination_hospital_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_partnerships_source_hospital_id_hospitals_id_fk'
      AND conrelid = 'referral_partnerships'::regclass
  ) THEN
    ALTER TABLE referral_partnerships
      ADD CONSTRAINT referral_partnerships_source_hospital_id_hospitals_id_fk
      FOREIGN KEY (source_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_partnerships_destination_hospital_id_hospitals_id_fk'
      AND conrelid = 'referral_partnerships'::regclass
  ) THEN
    ALTER TABLE referral_partnerships
      ADD CONSTRAINT referral_partnerships_destination_hospital_id_hospitals_id_fk
      FOREIGN KEY (destination_hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
  END IF;
END $$;
