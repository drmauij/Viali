ALTER TABLE clinic_services
  ADD COLUMN IF NOT EXISTS service_groups jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE clinic_services
  SET service_groups = jsonb_build_array(service_group)
  WHERE service_group IS NOT NULL
    AND service_groups = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS clinic_services_service_groups_gin_idx
  ON clinic_services USING GIN (service_groups);
