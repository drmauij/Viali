-- Chain Module Phase B: per-clinic "kind" flag that drives UI column/KPI
-- visibility. 'aesthetic' hides surgery columns, 'surgical' hides treatment
-- columns, 'mixed' shows both. Existing hospitals default to 'mixed' so the
-- UI stays identical until an admin narrows the setting.

-- 1. Enum type (idempotent via DO block checking pg_type)
DO $$ BEGIN
  CREATE TYPE clinic_kind AS ENUM ('aesthetic', 'surgical', 'mixed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Column on hospitals table. Add with NOT NULL and a default so existing rows
-- immediately get 'mixed'; Postgres applies the default as a single rewrite.
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS clinic_kind clinic_kind NOT NULL DEFAULT 'mixed';
