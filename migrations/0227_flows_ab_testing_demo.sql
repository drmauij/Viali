-- Migration 0227: A/B testing — demo-grade (manual winner pick, no cron)
-- Idempotent.

CREATE TABLE IF NOT EXISTS "flow_variants" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "flow_id" varchar NOT NULL REFERENCES "flows"("id") ON DELETE CASCADE,
  "label" varchar(10) NOT NULL,
  "message_subject" varchar(300),
  "message_template" text NOT NULL,
  "promo_code_id" varchar REFERENCES "promo_codes"("id"),
  "weight" integer NOT NULL DEFAULT 1,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_flow_variants_flow"
  ON "flow_variants" ("flow_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_flow_variants_flow_label"
  ON "flow_variants" ("flow_id", "label");

ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_test_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_holdout_pct_per_arm" integer NOT NULL DEFAULT 10;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_winner_variant_id" varchar;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_winner_sent_at" timestamp;
ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "ab_winner_status" varchar(20);

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "variant_id" varchar;
ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "booked_appointment_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_executions_variant_id_flow_variants_id_fk'
      AND conrelid = 'flow_executions'::regclass
  ) THEN
    ALTER TABLE "flow_executions"
      ADD CONSTRAINT "flow_executions_variant_id_flow_variants_id_fk"
      FOREIGN KEY ("variant_id") REFERENCES "flow_variants"("id")
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flow_executions_booked_appointment_id_fk'
      AND conrelid = 'flow_executions'::regclass
  ) THEN
    ALTER TABLE "flow_executions"
      ADD CONSTRAINT "flow_executions_booked_appointment_id_fk"
      FOREIGN KEY ("booked_appointment_id") REFERENCES "clinic_appointments"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_variant"
  ON "flow_executions" ("variant_id")
  WHERE "variant_id" IS NOT NULL;

ALTER TABLE "referral_events"
  ADD COLUMN IF NOT EXISTS "flow_execution_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_events_flow_execution_id_fk'
      AND conrelid = 'referral_events'::regclass
  ) THEN
    ALTER TABLE "referral_events"
      ADD CONSTRAINT "referral_events_flow_execution_id_fk"
      FOREIGN KEY ("flow_execution_id") REFERENCES "flow_executions"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "referral_events_flow_execution"
  ON "referral_events" ("flow_execution_id")
  WHERE "flow_execution_id" IS NOT NULL;
