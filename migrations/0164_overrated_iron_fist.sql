ALTER TABLE "calcom_config" ADD COLUMN IF NOT EXISTS "org_id" varchar;--> statement-breakpoint
ALTER TABLE "calcom_config" ADD COLUMN IF NOT EXISTS "sync_availability" boolean DEFAULT true;