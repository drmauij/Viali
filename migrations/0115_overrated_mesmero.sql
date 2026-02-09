ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "is_suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "suspended_by" varchar;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
