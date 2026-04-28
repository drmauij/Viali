-- Migration 0240: company jurisdiction (Gerichtsstand) becomes a hospital-level setting
-- and existing on_call_v1 starter templates flip their company.jurisdiction variable
-- from worker-fillable (`default: "Zürich"`) to auto-source (`source: "auto:hospital.companyJurisdiction"`).
-- Idempotent.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS company_jurisdiction varchar;

-- Backfill: any hospital that hasn't set a jurisdiction defaults to "Zürich"
-- (matches the prior template default; admins can override per hospital).
UPDATE hospitals
SET company_jurisdiction = 'Zürich'
WHERE company_jurisdiction IS NULL;

-- Patch existing on_call_v1 templates so the Gerichtsstand variable is auto-injected
-- from the hospital instead of being asked of the worker.
-- Only touches entries that still carry the legacy `default` field — re-running is a no-op.
UPDATE contract_templates
SET variables = jsonb_set(
  variables,
  '{simple}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'key' = 'company.jurisdiction' AND elem ? 'default' THEN
          jsonb_build_object(
            'key',    'company.jurisdiction',
            'type',   'text',
            'label',  'Gerichtsstand',
            'source', 'auto:hospital.companyJurisdiction'
          )
        ELSE elem
      END
    )
    FROM jsonb_array_elements(variables->'simple') AS elem
  )
)
WHERE starter_key = 'on_call_v1'
  AND archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(variables->'simple') AS e
    WHERE e->>'key' = 'company.jurisdiction'
      AND e ? 'default'
  );
