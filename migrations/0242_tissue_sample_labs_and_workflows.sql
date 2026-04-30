-- Migration 0242: Tissue & Samples — per-clinic external labs + lab-agnostic statuses
-- Idempotent — every statement guarded.

-- (a) Per-clinic external labs registry. The default lab moves out of the
-- shared/tissueSampleTypes.ts config and into per-hospital data.
CREATE TABLE IF NOT EXISTS tissue_sample_external_labs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id varchar NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  applicable_sample_types text[],          -- null/empty = all types
  contact text,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tissue_sample_external_labs_hospital
  ON tissue_sample_external_labs (hospital_id, is_archived);

-- (b) Data migration: rewrite existing fat-sample statuses + history rows
-- from the lab-specific labels ("… SSCB") to the new lab-agnostic labels.
-- Each UPDATE matches no rows on a re-run, so the migration is idempotent.
UPDATE tissue_samples
   SET status = 'Versendet'
 WHERE status = 'Versendet an SSCB';

UPDATE tissue_samples
   SET status = 'Eingelagert'
 WHERE status = 'Eingelagert bei SSCB';

UPDATE tissue_sample_status_history
   SET to_status = 'Versendet'
 WHERE to_status = 'Versendet an SSCB';

UPDATE tissue_sample_status_history
   SET to_status = 'Eingelagert'
 WHERE to_status = 'Eingelagert bei SSCB';

UPDATE tissue_sample_status_history
   SET from_status = 'Versendet'
 WHERE from_status = 'Versendet an SSCB';

UPDATE tissue_sample_status_history
   SET from_status = 'Eingelagert'
 WHERE from_status = 'Eingelagert bei SSCB';
