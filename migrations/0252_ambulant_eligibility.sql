-- 0252_ambulant_eligibility.sql
-- Pre-operative ambulant eligibility scoring (Caprini / STOP-BANG / RCRI / Apfel).
-- Gated by hospitals.addon_ambulant_eligibility. All new columns nullable / default-NULL
-- so existing rows are untouched; UI only renders when the addon is on.

-- Hospital-level addon flag
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS addon_ambulant_eligibility BOOLEAN NOT NULL DEFAULT false;

-- surgeries: booking-time fields
ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS surgery_risk_class VARCHAR;

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS ambulant_quick_check JSONB;

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS ambulant_override_reason TEXT;

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS ambulant_override_by VARCHAR;

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS ambulant_override_at TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE surgeries
    ADD CONSTRAINT surgeries_ambulant_override_by_fk
    FOREIGN KEY (ambulant_override_by) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- preop_assessments: pre-med-time fields (STOP-BANG inputs not in existing anamnesis + full result snapshot)
ALTER TABLE preop_assessments
  ADD COLUMN IF NOT EXISTS osas_snoring_loud BOOLEAN;

ALTER TABLE preop_assessments
  ADD COLUMN IF NOT EXISTS osas_observed_apnea BOOLEAN;

ALTER TABLE preop_assessments
  ADD COLUMN IF NOT EXISTS osas_daytime_tiredness BOOLEAN;

ALTER TABLE preop_assessments
  ADD COLUMN IF NOT EXISTS neck_circumference_cm NUMERIC(4,1);

ALTER TABLE preop_assessments
  ADD COLUMN IF NOT EXISTS ambulant_full_assessment JSONB;
