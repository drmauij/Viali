ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "coverage_type" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "coverage_type" varchar;