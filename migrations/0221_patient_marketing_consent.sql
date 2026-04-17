-- Migration 0221: add marketing consent columns to patients
-- Opt-out model — defaults to true so existing patients stay reachable.
-- Idempotent.

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "sms_marketing_consent" boolean NOT NULL DEFAULT true;

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "email_marketing_consent" boolean NOT NULL DEFAULT true;

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "marketing_unsubscribed_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_patients_marketing_consent"
  ON "patients" ("hospital_id", "sms_marketing_consent", "email_marketing_consent");
