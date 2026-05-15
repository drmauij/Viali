-- 0258_lead_timeslot_language.sql
-- Optional free-text preferred contact window + language hint on inbound leads.
-- Both nullable; existing rows untouched.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS timeslot TEXT;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS language VARCHAR(5);
