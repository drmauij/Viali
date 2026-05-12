-- 0253_external_surgery_request_ambulant.sql
-- Ambulant eligibility snapshot on external surgeon-portal submissions, so the
-- clinic-side admin queue can render the 🔴/🟡/🟢 pill at-a-glance without
-- recomputing the engine on every list render. Mirrors columns on `surgeries`.

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS surgery_risk_class VARCHAR;

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS ambulant_quick_check JSONB;
