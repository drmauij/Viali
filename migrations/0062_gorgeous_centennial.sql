CREATE TABLE IF NOT EXISTS "hospital_vonage_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"encrypted_api_key" varchar,
	"encrypted_api_secret" varchar,
	"encrypted_from_number" varchar,
	"is_enabled" boolean DEFAULT true,
	"last_tested_at" timestamp,
	"last_test_status" varchar,
	"last_test_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hospital_vonage_configs_hospital_id_unique" UNIQUE("hospital_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_availability_windows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"date" date NOT NULL,
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"slot_duration_minutes" integer DEFAULT 30,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "clinic_providers" ADD COLUMN IF NOT EXISTS "availability_mode" varchar DEFAULT 'always_available' NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "is_recurring" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "recurrence_pattern" varchar;
--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "recurrence_days_of_week" integer[];
--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "recurrence_end_date" date;
--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "recurrence_count" integer;
--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD COLUMN IF NOT EXISTS "parent_rule_id" varchar;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_vonage_configs_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "hospital_vonage_configs" ADD CONSTRAINT "hospital_vonage_configs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_availability_windows_provider_id_users_id_fk') THEN
    ALTER TABLE "provider_availability_windows" ADD CONSTRAINT "provider_availability_windows_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_availability_windows_unit_id_units_id_fk') THEN
    ALTER TABLE "provider_availability_windows" ADD CONSTRAINT "provider_availability_windows_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_availability_windows_created_by_users_id_fk') THEN
    ALTER TABLE "provider_availability_windows" ADD CONSTRAINT "provider_availability_windows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_vonage_configs_hospital" ON "hospital_vonage_configs" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_avail_windows_provider" ON "provider_availability_windows" USING btree ("provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_avail_windows_unit" ON "provider_availability_windows" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_avail_windows_date" ON "provider_availability_windows" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_time_off_recurring" ON "provider_time_off" USING btree ("is_recurring");
