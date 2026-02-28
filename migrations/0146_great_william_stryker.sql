ALTER TABLE "calcom_config" ADD COLUMN IF NOT EXISTS "ics_feed_credential_id" varchar;--> statement-breakpoint
ALTER TABLE "calcom_config" ADD COLUMN IF NOT EXISTS "ics_feed_subscribed_at" timestamp;
