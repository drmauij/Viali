CREATE TABLE IF NOT EXISTS "hospital_aspsms_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"encrypted_user_key" varchar,
	"encrypted_password" varchar,
	"originator" varchar(11),
	"is_enabled" boolean DEFAULT true,
	"last_tested_at" timestamp,
	"last_test_status" varchar,
	"last_test_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hospital_aspsms_configs_hospital_id_unique" UNIQUE("hospital_id")
);
--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "sms_provider" varchar DEFAULT 'auto';--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_aspsms_configs_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "hospital_aspsms_configs" ADD CONSTRAINT "hospital_aspsms_configs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hospital_aspsms_configs_hospital" ON "hospital_aspsms_configs" USING btree ("hospital_id");