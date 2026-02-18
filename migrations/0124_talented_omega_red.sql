DO $$ BEGIN
  CREATE TYPE "public"."discharge_brief_type" AS ENUM('surgery_discharge', 'anesthesia_discharge', 'anesthesia_overnight_discharge');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discharge_brief_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"brief_type" "discharge_brief_type" NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"template_content" text,
	"assigned_user_id" varchar,
	"procedure_type" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discharge_briefs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"surgery_id" varchar,
	"brief_type" "discharge_brief_type" NOT NULL,
	"language" varchar(5) DEFAULT 'de' NOT NULL,
	"template_id" varchar,
	"content" text,
	"source_data_snapshot" jsonb,
	"signature" text,
	"signed_by" varchar,
	"signed_at" timestamp,
	"pdf_url" varchar,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"locked_by" varchar,
	"unlocked_at" timestamp,
	"unlocked_by" varchar,
	"unlock_reason" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_brief_templates" ADD CONSTRAINT "discharge_brief_templates_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_brief_templates" ADD CONSTRAINT "discharge_brief_templates_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_brief_templates" ADD CONSTRAINT "discharge_brief_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_template_id_discharge_brief_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."discharge_brief_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_briefs" ADD CONSTRAINT "discharge_briefs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_brief_templates_hospital" ON "discharge_brief_templates" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_brief_templates_type" ON "discharge_brief_templates" USING btree ("brief_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_brief_templates_active" ON "discharge_brief_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_brief_templates_assigned" ON "discharge_brief_templates" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_briefs_hospital" ON "discharge_briefs" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_briefs_patient" ON "discharge_briefs" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_briefs_surgery" ON "discharge_briefs" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_briefs_type" ON "discharge_briefs" USING btree ("brief_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_briefs_locked" ON "discharge_briefs" USING btree ("is_locked");
