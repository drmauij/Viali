-- Snapshot columns on referral_events so conversion tracking survives
-- when a linked appointment is hard-deleted (FK is ON DELETE SET NULL).
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "appointment_deleted_at" timestamp;
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "appointment_final_status" varchar;
