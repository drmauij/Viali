-- 0249_external_surgery_request_extra_fields.sql
-- Restores chop_code, surgery_side, and antibiose_prophylaxe to
-- external_surgery_requests so the surgeon-portal form can capture the
-- same procedural metadata the deleted public form did.

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS chop_code VARCHAR;

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS surgery_side VARCHAR;

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS antibiose_prophylaxe BOOLEAN NOT NULL DEFAULT false;
