-- Personalstammblatt rollout: per-hospital addon flag + new columns on external_worklog_links

ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "addon_personalstammblatt" boolean NOT NULL DEFAULT false;

ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "personal_data_only" boolean NOT NULL DEFAULT false;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "invite_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "last_invited_at" timestamp;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_worklog_links_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "external_worklog_links"
      ADD CONSTRAINT "external_worklog_links_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "external_worklog_links" ALTER COLUMN "unit_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_external_worklog_links_user_hospital"
  ON "external_worklog_links" ("user_id", "hospital_id");
