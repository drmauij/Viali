-- Migration 0239: Per-template share token.
-- Adds public_token column to contract_templates so each template can have its
-- own shareable URL (independent from the hospital-wide contract_token).
-- Idempotent.

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS public_token varchar;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'contract_templates_public_token_unique') THEN
    CREATE UNIQUE INDEX contract_templates_public_token_unique
      ON contract_templates(public_token)
      WHERE public_token IS NOT NULL;
  END IF;
END $$;

-- Backfill: every existing template (active or draft) gets a token so it's
-- shareable without a manual regenerate step.
UPDATE contract_templates
SET public_token = replace(gen_random_uuid()::text, '-', '')
WHERE public_token IS NULL;
