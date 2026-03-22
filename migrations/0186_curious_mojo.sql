DROP INDEX IF EXISTS "idx_clinic_services_hospital_code";--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "gclid" varchar;--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "gbraid" varchar;--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "wbraid" varchar;--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "fbclid" varchar;--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "ttclid" varchar;--> statement-breakpoint
ALTER TABLE "referral_events" ADD COLUMN IF NOT EXISTS "msclkid" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_clinic_services_hospital_code" ON "clinic_services" USING btree ("hospital_id","code") WHERE code IS NOT NULL;