ALTER TABLE "preop_assessments" ADD COLUMN "emergency_no_signature" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "send_email_copy" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "preop_assessments" ADD COLUMN "email_for_copy" varchar;