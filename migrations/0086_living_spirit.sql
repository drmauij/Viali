-- External Surgery Requests table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_surgery_requests') THEN
    CREATE TABLE "external_surgery_requests" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "hospital_id" varchar NOT NULL,
      "surgeon_first_name" varchar NOT NULL,
      "surgeon_last_name" varchar NOT NULL,
      "surgeon_email" varchar NOT NULL,
      "surgeon_phone" varchar NOT NULL,
      "surgery_name" varchar NOT NULL,
      "surgery_duration_minutes" integer NOT NULL,
      "with_anesthesia" boolean DEFAULT true NOT NULL,
      "surgery_notes" text,
      "wished_date" date NOT NULL,
      "patient_first_name" varchar NOT NULL,
      "patient_last_name" varchar NOT NULL,
      "patient_birthday" date NOT NULL,
      "patient_email" varchar,
      "patient_phone" varchar NOT NULL,
      "status" varchar DEFAULT 'pending' NOT NULL,
      "surgery_id" varchar,
      "patient_id" varchar,
      "confirmation_email_sent" boolean DEFAULT false,
      "confirmation_sms_sent" boolean DEFAULT false,
      "internal_notes" text,
      "decline_reason" text,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now(),
      "scheduled_at" timestamp,
      "scheduled_by" varchar
    );
  END IF;
END $$;

-- External Surgery Request Documents table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_surgery_request_documents') THEN
    CREATE TABLE "external_surgery_request_documents" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "request_id" varchar NOT NULL,
      "file_name" varchar NOT NULL,
      "file_url" varchar NOT NULL,
      "mime_type" varchar,
      "file_size" integer,
      "description" text,
      "created_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Add external_surgery_token to hospitals
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'external_surgery_token') THEN
    ALTER TABLE "hospitals" ADD COLUMN "external_surgery_token" varchar;
  END IF;
END $$;

-- Add reviewed column to patient_questionnaire_uploads
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_uploads' AND column_name = 'reviewed') THEN
    ALTER TABLE "patient_questionnaire_uploads" ADD COLUMN "reviewed" boolean DEFAULT false;
  END IF;
END $$;

-- Foreign keys for external_surgery_request_documents
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'external_surgery_request_documents_request_id_external_surgery_requests_id_fk') THEN
    ALTER TABLE "external_surgery_request_documents" ADD CONSTRAINT "external_surgery_request_documents_request_id_external_surgery_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."external_surgery_requests"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

-- Foreign keys for external_surgery_requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'external_surgery_requests_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "external_surgery_requests" ADD CONSTRAINT "external_surgery_requests_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'external_surgery_requests_surgery_id_surgeries_id_fk') THEN
    ALTER TABLE "external_surgery_requests" ADD CONSTRAINT "external_surgery_requests_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'external_surgery_requests_patient_id_patients_id_fk') THEN
    ALTER TABLE "external_surgery_requests" ADD CONSTRAINT "external_surgery_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'external_surgery_requests_scheduled_by_users_id_fk') THEN
    ALTER TABLE "external_surgery_requests" ADD CONSTRAINT "external_surgery_requests_scheduled_by_users_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Indexes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_external_surgery_docs_request') THEN
    CREATE INDEX "idx_external_surgery_docs_request" ON "external_surgery_request_documents" USING btree ("request_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_external_surgery_requests_hospital') THEN
    CREATE INDEX "idx_external_surgery_requests_hospital" ON "external_surgery_requests" USING btree ("hospital_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_external_surgery_requests_status') THEN
    CREATE INDEX "idx_external_surgery_requests_status" ON "external_surgery_requests" USING btree ("status");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_external_surgery_requests_wished_date') THEN
    CREATE INDEX "idx_external_surgery_requests_wished_date" ON "external_surgery_requests" USING btree ("wished_date");
  END IF;
END $$;

-- Unique constraint for external_surgery_token
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'hospitals_external_surgery_token_unique') THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_external_surgery_token_unique" UNIQUE("external_surgery_token");
  END IF;
END $$;
