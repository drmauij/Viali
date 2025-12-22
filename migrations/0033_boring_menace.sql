-- Add coagulation_illnesses column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preop_assessments' AND column_name='coagulation_illnesses') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "coagulation_illnesses" jsonb;
  END IF;
END $$;--> statement-breakpoint

-- Add infectious_illnesses column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preop_assessments' AND column_name='infectious_illnesses') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "infectious_illnesses" jsonb;
  END IF;
END $$;--> statement-breakpoint

-- Add coagulation_infectious_notes column if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='preop_assessments' AND column_name='coagulation_infectious_notes') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "coagulation_infectious_notes" text;
  END IF;
END $$;
