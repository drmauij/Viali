-- Migration 0219: track who declined external surgery requests
-- Mirrors scheduled_by / scheduled_at. Previously only the reason text was stored;
-- the declining user is now persisted for audit + UI display.
-- Idempotent.

ALTER TABLE "external_surgery_requests"
  ADD COLUMN IF NOT EXISTS "declined_at" timestamp;

ALTER TABLE "external_surgery_requests"
  ADD COLUMN IF NOT EXISTS "declined_by" varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_surgery_requests_declined_by_users_id_fk'
      AND conrelid = 'external_surgery_requests'::regclass
  ) THEN
    ALTER TABLE "external_surgery_requests"
      ADD CONSTRAINT "external_surgery_requests_declined_by_users_id_fk"
      FOREIGN KEY ("declined_by") REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
