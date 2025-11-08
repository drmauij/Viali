ALTER TABLE "preop_assessments" ADD COLUMN "consent_regional" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_installations" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_icu" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "consent_doctor_signature" text;