CREATE TABLE IF NOT EXISTS "patient_document_folders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "patient_documents" ADD COLUMN IF NOT EXISTS "document_folder_id" varchar;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_document_folders_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "patient_document_folders" ADD CONSTRAINT "patient_document_folders_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_document_folders_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_document_folders" ADD CONSTRAINT "patient_document_folders_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_document_folders_patient" ON "patient_document_folders" USING btree ("patient_id");
