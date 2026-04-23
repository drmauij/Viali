-- Billing defaults at the group level. Platform admin sets these and can
-- optionally cascade to every member hospital via a separate admin action.
-- Clinics retain their own licenseType / pricePerRecord columns as before.

ALTER TABLE hospital_groups
  ADD COLUMN IF NOT EXISTS default_license_type varchar,
  ADD COLUMN IF NOT EXISTS default_price_per_record numeric(10, 2);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hospital_groups_default_license_type_check'
  ) THEN
    ALTER TABLE hospital_groups
      ADD CONSTRAINT hospital_groups_default_license_type_check
      CHECK (default_license_type IS NULL OR default_license_type IN ('free', 'basic', 'test'));
  END IF;
END $$;
