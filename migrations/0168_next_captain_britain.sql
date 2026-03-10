CREATE TABLE IF NOT EXISTS "appointment_action_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"action" varchar NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "appointment_action_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "appointment_reminder_disabled" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "appointment_action_tokens" ADD CONSTRAINT "appointment_action_tokens_appointment_id_clinic_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."clinic_appointments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "appointment_action_tokens" ADD CONSTRAINT "appointment_action_tokens_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointment_action_tokens_token" ON "appointment_action_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointment_action_tokens_appointment" ON "appointment_action_tokens" USING btree ("appointment_id");
