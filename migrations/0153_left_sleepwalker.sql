DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'surgeon_action_request_status') THEN
    CREATE TYPE "public"."surgeon_action_request_status" AS ENUM('pending', 'accepted', 'refused');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'surgeon_action_request_type') THEN
    CREATE TYPE "public"."surgeon_action_request_type" AS ENUM('cancellation', 'reschedule', 'suspension');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surgeon_action_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"surgery_id" varchar NOT NULL,
	"surgeon_email" varchar NOT NULL,
	"type" "surgeon_action_request_type" NOT NULL,
	"reason" text NOT NULL,
	"proposed_date" date,
	"proposed_time_from" integer,
	"proposed_time_to" integer,
	"status" "surgeon_action_request_status" DEFAULT 'pending' NOT NULL,
	"response_note" text,
	"responded_by" varchar,
	"responded_at" timestamp,
	"confirmation_email_sent" boolean DEFAULT false,
	"confirmation_sms_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "portal_access_sessions" ADD COLUMN IF NOT EXISTS "surgeon_email" varchar;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeon_action_requests_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "surgeon_action_requests" ADD CONSTRAINT "surgeon_action_requests_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeon_action_requests_surgery_id_surgeries_id_fk') THEN
    ALTER TABLE "surgeon_action_requests" ADD CONSTRAINT "surgeon_action_requests_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeon_action_requests_responded_by_users_id_fk') THEN
    ALTER TABLE "surgeon_action_requests" ADD CONSTRAINT "surgeon_action_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeon_action_requests_hospital_status" ON "surgeon_action_requests" USING btree ("hospital_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeon_action_requests_surgery" ON "surgeon_action_requests" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeon_action_requests_email" ON "surgeon_action_requests" USING btree ("surgeon_email");
