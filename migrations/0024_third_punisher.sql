-- Idempotent migration: Create surgery_preop_assessments table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'surgery_preop_assessments') THEN
    CREATE TABLE "surgery_preop_assessments" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "surgery_id" varchar NOT NULL,
      "height" varchar,
      "weight" varchar,
      "heart_rate" varchar,
      "blood_pressure_systolic" varchar,
      "blood_pressure_diastolic" varchar,
      "cave" text,
      "special_notes" text,
      "anticoagulation_meds" text[],
      "anticoagulation_meds_other" text,
      "general_meds" text[],
      "general_meds_other" text,
      "medications_notes" text,
      "heart_illnesses" jsonb,
      "heart_notes" text,
      "lung_illnesses" jsonb,
      "lung_notes" text,
      "gi_illnesses" jsonb,
      "kidney_illnesses" jsonb,
      "metabolic_illnesses" jsonb,
      "gi_kidney_metabolic_notes" text,
      "neuro_illnesses" jsonb,
      "psych_illnesses" jsonb,
      "skeletal_illnesses" jsonb,
      "neuro_psych_skeletal_notes" text,
      "woman_issues" jsonb,
      "woman_notes" text,
      "noxen" jsonb,
      "noxen_notes" text,
      "children_issues" jsonb,
      "children_notes" text,
      "last_solids" varchar,
      "last_clear" varchar,
      "stand_by" boolean DEFAULT false,
      "stand_by_reason" varchar,
      "stand_by_reason_note" text,
      "assessment_date" varchar,
      "doctor_name" varchar,
      "doctor_signature" text,
      "status" varchar DEFAULT 'draft',
      "consent_file_url" varchar,
      "consent_file_name" varchar,
      "consent_uploaded_at" timestamp,
      "consent_notes" text,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now(),
      CONSTRAINT "surgery_preop_assessments_surgery_id_unique" UNIQUE("surgery_id")
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'surgery_preop_assessments_surgery_id_surgeries_id_fk' 
    AND table_name = 'surgery_preop_assessments'
  ) THEN
    ALTER TABLE "surgery_preop_assessments" ADD CONSTRAINT "surgery_preop_assessments_surgery_id_surgeries_id_fk" 
    FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_preop_assessments_surgery" ON "surgery_preop_assessments" USING btree ("surgery_id");
