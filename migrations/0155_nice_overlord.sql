DO $$ BEGIN
  CREATE TYPE "public"."login_event_type" AS ENUM('login_success', 'login_failed', 'logout', 'password_change', 'password_reset_request', 'password_reset_complete', 'google_login_success');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"email" varchar NOT NULL,
	"event_type" "login_event_type" NOT NULL,
	"ip_address" varchar,
	"user_agent" text,
	"failure_reason" text,
	"hospital_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "login_audit_log" ADD CONSTRAINT "login_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "login_audit_log" ADD CONSTRAINT "login_audit_log_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_audit_user_created" ON "login_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_audit_hospital_created" ON "login_audit_log" USING btree ("hospital_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_audit_event_type" ON "login_audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_login_audit_email" ON "login_audit_log" USING btree ("email");
