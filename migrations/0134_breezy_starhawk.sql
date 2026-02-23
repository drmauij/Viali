CREATE TABLE IF NOT EXISTS "worktime_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"entered_by_id" varchar,
	"work_date" date NOT NULL,
	"time_start" varchar(5) NOT NULL,
	"time_end" varchar(5) NOT NULL,
	"pause_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idx_external_worklog_links_unit_email'
  ) THEN
    ALTER TABLE "external_worklog_links" DROP CONSTRAINT "idx_external_worklog_links_unit_email";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "kiosk_token" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weekly_target_hours" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kiosk_pin_hash" varchar;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'worktime_logs_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "worktime_logs" ADD CONSTRAINT "worktime_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'worktime_logs_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "worktime_logs" ADD CONSTRAINT "worktime_logs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'worktime_logs_entered_by_id_users_id_fk'
  ) THEN
    ALTER TABLE "worktime_logs" ADD CONSTRAINT "worktime_logs_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_worktime_logs_user_date" ON "worktime_logs" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_worktime_logs_hospital" ON "worktime_logs" USING btree ("hospital_id");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idx_external_worklog_links_hospital_email'
  ) THEN
    ALTER TABLE "external_worklog_links" ADD CONSTRAINT "idx_external_worklog_links_hospital_email" UNIQUE("hospital_id","email");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hospitals_kiosk_token_unique'
  ) THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_kiosk_token_unique" UNIQUE("kiosk_token");
  END IF;
END $$;
