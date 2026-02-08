ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_allergies" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_medications" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_conditions" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_smoking_alcohol" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_previous_surgeries" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_anesthesia_problems" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_dental_issues" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_ponv_issues" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "no_drug_use" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_signed_by_proxy" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_proxy_signer_name" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_proxy_signer_relation" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_signer_id_front_url" text;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_signer_id_back_url" text;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_remote_signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_invitation_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_invitation_method" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "callback_appointment_slots" jsonb;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "callback_phone_number" varchar;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "callback_invitation_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "callback_invitation_method" varchar;