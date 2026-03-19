CREATE INDEX IF NOT EXISTS "referral_events_hospital_created" ON "referral_events" USING btree ("hospital_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_events_appointment_id" ON "referral_events" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_events_patient_id" ON "referral_events" USING btree ("patient_id");--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" DROP COLUMN IF EXISTS "referral_source";--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" DROP COLUMN IF EXISTS "referral_source_detail";
