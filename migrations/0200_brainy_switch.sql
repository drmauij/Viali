ALTER TABLE "discharge_briefs" ADD COLUMN IF NOT EXISTS "portal_visible" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "discharge_briefs" ADD COLUMN IF NOT EXISTS "portal_shared_at" timestamp;--> statement-breakpoint
ALTER TABLE "discharge_briefs" ADD COLUMN IF NOT EXISTS "portal_shared_by" varchar;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discharge_briefs_portal_shared_by_users_id_fk'
  ) THEN
    ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_portal_shared_by_users_id_fk" FOREIGN KEY ("portal_shared_by") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
