DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patient_merge_status') THEN
    CREATE TYPE "public"."patient_merge_status" AS ENUM('completed', 'undone');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_merges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"primary_patient_id" varchar NOT NULL,
	"secondary_patient_id" varchar NOT NULL,
	"merged_by" varchar NOT NULL,
	"primary_patient_snapshot" jsonb NOT NULL,
	"secondary_patient_snapshot" jsonb NOT NULL,
	"fk_updates" jsonb NOT NULL,
	"field_choices" jsonb NOT NULL,
	"deleted_chat_archives" jsonb,
	"conversation_id_updates" jsonb,
	"status" "patient_merge_status" DEFAULT 'completed' NOT NULL,
	"undone_at" timestamp,
	"undone_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_merges_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "patient_merges" ADD CONSTRAINT "patient_merges_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_merges_primary_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_merges" ADD CONSTRAINT "patient_merges_primary_patient_id_patients_id_fk" FOREIGN KEY ("primary_patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_merges_secondary_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_merges" ADD CONSTRAINT "patient_merges_secondary_patient_id_patients_id_fk" FOREIGN KEY ("secondary_patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_merges_merged_by_users_id_fk') THEN
    ALTER TABLE "patient_merges" ADD CONSTRAINT "patient_merges_merged_by_users_id_fk" FOREIGN KEY ("merged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_merges_undone_by_users_id_fk') THEN
    ALTER TABLE "patient_merges" ADD CONSTRAINT "patient_merges_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_merges_hospital" ON "patient_merges" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_merges_primary" ON "patient_merges" USING btree ("primary_patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_merges_secondary" ON "patient_merges" USING btree ("secondary_patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_merges_status" ON "patient_merges" USING btree ("status");
