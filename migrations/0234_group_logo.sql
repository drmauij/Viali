-- Group logo column (mirrors hospitals.company_logo_url storage semantics —
-- data URL string, can get large, so use `text` not `varchar`).
ALTER TABLE hospital_groups ADD COLUMN IF NOT EXISTS logo_url text;
