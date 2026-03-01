ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "approval_status" varchar DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "approved_by" varchar;--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_time_off_approved_by_users_id_fk'
  ) THEN
    ALTER TABLE "provider_time_off" ADD CONSTRAINT "provider_time_off_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
UPDATE "provider_time_off" SET "approval_status" = 'approved' WHERE "approval_status" = 'pending';
