-- Create patient_messages table (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_messages') THEN
    CREATE TABLE "patient_messages" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "hospital_id" varchar NOT NULL,
      "patient_id" varchar NOT NULL,
      "sent_by" varchar NOT NULL,
      "channel" varchar(10) NOT NULL,
      "recipient" varchar NOT NULL,
      "message" text NOT NULL,
      "status" varchar(20) DEFAULT 'sent',
      "created_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Add foreign key constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_messages_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "patient_messages" ADD CONSTRAINT "patient_messages_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_messages_patient_id_patients_id_fk') THEN
    ALTER TABLE "patient_messages" ADD CONSTRAINT "patient_messages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_messages_sent_by_users_id_fk') THEN
    ALTER TABLE "patient_messages" ADD CONSTRAINT "patient_messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Create indexes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patient_messages_hospital') THEN
    CREATE INDEX "idx_patient_messages_hospital" ON "patient_messages" USING btree ("hospital_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_patient_messages_patient') THEN
    CREATE INDEX "idx_patient_messages_patient" ON "patient_messages" USING btree ("patient_id");
  END IF;
END $$;
