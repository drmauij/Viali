ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "anesthesia_notes" text;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "wished_time_from" integer;--> statement-breakpoint
ALTER TABLE "external_surgery_requests" ADD COLUMN IF NOT EXISTS "wished_time_to" integer;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "anesthesia_notes" text;
