-- Add allergies column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgery_preop_assessments' AND column_name='allergies') THEN
    ALTER TABLE "surgery_preop_assessments" ADD COLUMN "allergies" text[];
  END IF;
END $$;--> statement-breakpoint

-- Add other_allergies column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgery_preop_assessments' AND column_name='other_allergies') THEN
    ALTER TABLE "surgery_preop_assessments" ADD COLUMN "other_allergies" text;
  END IF;
END $$;--> statement-breakpoint

-- Add consent_date column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgery_preop_assessments' AND column_name='consent_date') THEN
    ALTER TABLE "surgery_preop_assessments" ADD COLUMN "consent_date" varchar;
  END IF;
END $$;--> statement-breakpoint

-- Add patient_signature column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgery_preop_assessments' AND column_name='patient_signature') THEN
    ALTER TABLE "surgery_preop_assessments" ADD COLUMN "patient_signature" text;
  END IF;
END $$;
