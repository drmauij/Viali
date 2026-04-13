ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS stay_type VARCHAR;
ALTER TABLE external_surgery_requests ADD COLUMN IF NOT EXISTS stay_type VARCHAR;
