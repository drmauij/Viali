ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "meta_lead_id" varchar;--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "meta_form_id" varchar;
