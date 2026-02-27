ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_street" varchar;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_postal_code" varchar;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "patient_city" varchar;
