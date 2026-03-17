ALTER TABLE "patient_questionnaire_responses" ADD COLUMN IF NOT EXISTS "patient_street" varchar;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN IF NOT EXISTS "patient_postal_code" varchar;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN IF NOT EXISTS "patient_city" varchar;