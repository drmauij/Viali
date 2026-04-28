-- Migration 0238: Generalized contract templates.
-- Adds contract_templates (chain or hospital owned) plus 4 nullable columns on
-- worker_contracts so existing rows continue to function untouched.
-- Idempotent.

CREATE TABLE IF NOT EXISTS contract_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hospital_id varchar REFERENCES hospitals(id),
  owner_chain_id    varchar REFERENCES hospital_groups(id),
  name varchar NOT NULL,
  description text,
  language varchar(2) NOT NULL DEFAULT 'de',
  status varchar NOT NULL DEFAULT 'draft',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '{"simple":[],"selectableLists":[]}'::jsonb,
  is_starter_clone boolean NOT NULL DEFAULT false,
  starter_key varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  archived_at timestamp
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_templates_owner_xor') THEN
    ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_owner_xor CHECK (
      (owner_hospital_id IS NOT NULL)::int + (owner_chain_id IS NOT NULL)::int = 1
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contract_templates_owner_hospital ON contract_templates(owner_hospital_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_owner_chain    ON contract_templates(owner_chain_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_status         ON contract_templates(status);

ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS template_id       varchar REFERENCES contract_templates(id);
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS template_snapshot jsonb;
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS data              jsonb;
ALTER TABLE worker_contracts ADD COLUMN IF NOT EXISTS public_token      varchar;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'worker_contracts_public_token_unique') THEN
    CREATE UNIQUE INDEX worker_contracts_public_token_unique ON worker_contracts(public_token) WHERE public_token IS NOT NULL;
  END IF;
END $$;
