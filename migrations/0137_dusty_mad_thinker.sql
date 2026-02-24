CREATE TABLE IF NOT EXISTS "episode_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_episodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"episode_number" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"reference_date" timestamp,
	"status" varchar DEFAULT 'open' NOT NULL,
	"created_by" varchar,
	"closed_at" timestamp,
	"closed_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_patient_episodes_number" UNIQUE("hospital_id","episode_number")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_documents' AND column_name = 'episode_id') THEN
    ALTER TABLE "patient_documents" ADD COLUMN "episode_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_documents' AND column_name = 'episode_folder_id') THEN
    ALTER TABLE "patient_documents" ADD COLUMN "episode_folder_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_notes' AND column_name = 'episode_id') THEN
    ALTER TABLE "patient_notes" ADD COLUMN "episode_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'episode_id') THEN
    ALTER TABLE "surgeries" ADD COLUMN "episode_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'episode_folders_episode_id_patient_episodes_id_fk') THEN
    ALTER TABLE "episode_folders" ADD CONSTRAINT "episode_folders_episode_id_patient_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."patient_episodes"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'patient_episodes_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "patient_episodes" ADD CONSTRAINT "patient_episodes_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'patient_episodes_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_episodes" ADD CONSTRAINT "patient_episodes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'patient_episodes_created_by_users_id_fk') THEN
    ALTER TABLE "patient_episodes" ADD CONSTRAINT "patient_episodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'patient_episodes_closed_by_users_id_fk') THEN
    ALTER TABLE "patient_episodes" ADD CONSTRAINT "patient_episodes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_episode_folders_episode" ON "episode_folders" USING btree ("episode_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_episodes_hospital" ON "patient_episodes" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_episodes_patient" ON "patient_episodes" USING btree ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_episodes_status" ON "patient_episodes" USING btree ("status");
