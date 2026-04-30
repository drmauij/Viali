-- Migration 0241: Tissue & Samples
-- Adds two new tables, two new columns, and indexes/unique constraints.
-- Idempotent — every statement uses IF [NOT] EXISTS guards.

-- Per-clinic prefix used in sample codes (e.g. 'PKK', 'B2G').
-- UNIQUE across the system; set-once-immutable policy enforced in app code.
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS sample_code_prefix varchar(8);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hospitals_sample_code_prefix_unique'
  ) THEN
    ALTER TABLE hospitals
      ADD CONSTRAINT hospitals_sample_code_prefix_unique UNIQUE (sample_code_prefix);
  END IF;
END $$;

-- Main table: one row per banked sample.
CREATE TABLE IF NOT EXISTS tissue_samples (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id varchar NOT NULL REFERENCES hospitals(id),
  patient_id varchar NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sample_type varchar NOT NULL,
  code varchar NOT NULL,
  status varchar NOT NULL,
  status_date timestamp NOT NULL DEFAULT now(),
  notes text,
  extraction_surgery_id varchar REFERENCES surgeries(id) ON DELETE SET NULL,
  reimplant_surgery_id varchar REFERENCES surgeries(id) ON DELETE SET NULL,
  external_lab varchar,
  created_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tissue_samples_code_unique
  ON tissue_samples (code);
CREATE INDEX IF NOT EXISTS idx_tissue_samples_hospital_patient
  ON tissue_samples (hospital_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_tissue_samples_extraction_surgery
  ON tissue_samples (extraction_surgery_id);
CREATE INDEX IF NOT EXISTS idx_tissue_samples_reimplant_surgery
  ON tissue_samples (reimplant_surgery_id);
CREATE INDEX IF NOT EXISTS idx_tissue_samples_status
  ON tissue_samples (status);

-- Status history: one row per status transition. The current status on
-- tissue_samples is denormalized for query speed; the history is the source
-- of truth for the timeline.
CREATE TABLE IF NOT EXISTS tissue_sample_status_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id varchar NOT NULL REFERENCES tissue_samples(id) ON DELETE CASCADE,
  from_status varchar,
  to_status varchar NOT NULL,
  changed_at timestamp NOT NULL DEFAULT now(),
  changed_by varchar NOT NULL REFERENCES users(id),
  note text
);

CREATE INDEX IF NOT EXISTS idx_tissue_sample_status_history_sample
  ON tissue_sample_status_history (sample_id, changed_at);

-- Optional link from a document to the sample it describes (lab report,
-- consent, photo of the sample).
-- Inline REFERENCES is idempotent because ADD COLUMN IF NOT EXISTS skips both
-- the column and its FK on re-run (matches the pattern in migration 0238).
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS tissue_sample_id varchar REFERENCES tissue_samples(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_documents_tissue_sample
  ON patient_documents (tissue_sample_id);
