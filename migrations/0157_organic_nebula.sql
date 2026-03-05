CREATE TABLE IF NOT EXISTS "patient_chat_archives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"archived_by" varchar,
	"archived_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_chat_archives_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "patient_chat_archives" ADD CONSTRAINT "patient_chat_archives_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_chat_archives_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_chat_archives" ADD CONSTRAINT "patient_chat_archives_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_chat_archives_archived_by_users_id_fk') THEN
    ALTER TABLE "patient_chat_archives" ADD CONSTRAINT "patient_chat_archives_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_chat_archives_lookup" ON "patient_chat_archives" USING btree ("hospital_id","patient_id");
