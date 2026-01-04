-- Create patient_documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS "patient_documents" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "hospital_id" varchar NOT NULL,
        "patient_id" varchar NOT NULL,
        "category" varchar NOT NULL,
        "file_name" varchar NOT NULL,
        "file_url" varchar NOT NULL,
        "mime_type" varchar,
        "file_size" integer,
        "description" text,
        "uploaded_by" varchar,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
-- Add email_sent column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='email_sent') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "email_sent" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
-- Add email_sent_at column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='email_sent_at') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "email_sent_at" timestamp;
  END IF;
END $$;
--> statement-breakpoint
-- Add email_sent_to column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='email_sent_to') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "email_sent_to" varchar;
  END IF;
END $$;
--> statement-breakpoint
-- Add email_sent_by column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='email_sent_by') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "email_sent_by" varchar;
  END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraint for patient_documents.hospital_id if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patient_documents_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraint for patient_documents.patient_id if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patient_documents_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraint for patient_documents.uploaded_by if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patient_documents_uploaded_by_users_id_fk') THEN
    ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Create index on patient_documents.hospital_id if it doesn't exist
CREATE INDEX IF NOT EXISTS "idx_patient_documents_hospital" ON "patient_documents" USING btree ("hospital_id");
--> statement-breakpoint
-- Create index on patient_documents.patient_id if it doesn't exist
CREATE INDEX IF NOT EXISTS "idx_patient_documents_patient" ON "patient_documents" USING btree ("patient_id");
--> statement-breakpoint
-- Add foreign key constraint for patient_questionnaire_links.email_sent_by if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patient_questionnaire_links_email_sent_by_users_id_fk') THEN
    ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_email_sent_by_users_id_fk" FOREIGN KEY ("email_sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
