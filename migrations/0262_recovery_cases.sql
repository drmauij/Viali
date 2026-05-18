-- 0262_recovery_cases.sql
-- New tables for no-show / cancellation recovery follow-up workflow.
-- All statements are idempotent (safe to run multiple times).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_case_status') THEN
    CREATE TYPE recovery_case_status AS ENUM (
      'pending', 'to_verify', 'in_progress', 'rescheduled', 'closed_lost', 'closed_other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recovery_case_trigger') THEN
    CREATE TYPE recovery_case_trigger AS ENUM ('no_show', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS recovery_cases (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id VARCHAR NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  appointment_id VARCHAR NOT NULL REFERENCES clinic_appointments(id) ON DELETE CASCADE,
  patient_id VARCHAR NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  trigger recovery_case_trigger NOT NULL,
  status recovery_case_status NOT NULL DEFAULT 'pending',
  rescheduled_appointment_id VARCHAR REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  closed_reason VARCHAR,
  closed_at TIMESTAMP,
  closed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recovery_cases_hospital_status_created
  ON recovery_cases(hospital_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_cases_appointment_uidx
  ON recovery_cases(appointment_id);

CREATE INDEX IF NOT EXISTS recovery_cases_hospital_patient
  ON recovery_cases(hospital_id, patient_id);

CREATE TABLE IF NOT EXISTS recovery_case_contacts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id VARCHAR NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  outcome lead_contact_outcome NOT NULL,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recovery_case_contacts_case_created
  ON recovery_case_contacts(recovery_case_id, created_at);
