-- Scheduled Jobs table for background task scheduling (auto-questionnaire dispatch, etc.)
CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"processed_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"results" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_jobs_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_jobs_type" ON "scheduled_jobs" USING btree ("job_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_jobs_hospital" ON "scheduled_jobs" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_jobs_status" ON "scheduled_jobs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_jobs_scheduled_for" ON "scheduled_jobs" USING btree ("scheduled_for");
