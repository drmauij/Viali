-- Migration 0228: optional campaign-level treatment for flows
-- Used to preselect the service in the booking link when the segment
-- isn't filtered by treatment. Idempotent.

ALTER TABLE "flows"
  ADD COLUMN IF NOT EXISTS "campaign_treatment_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flows_campaign_treatment_id_clinic_services_id_fk'
      AND conrelid = 'flows'::regclass
  ) THEN
    ALTER TABLE "flows"
      ADD CONSTRAINT "flows_campaign_treatment_id_clinic_services_id_fk"
      FOREIGN KEY ("campaign_treatment_id") REFERENCES "clinic_services"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_flows_campaign_treatment"
  ON "flows" ("campaign_treatment_id")
  WHERE "campaign_treatment_id" IS NOT NULL;
