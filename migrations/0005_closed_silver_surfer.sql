DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'surgery_staff') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "surgery_staff" jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'intra_op_data') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "intra_op_data" jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'counts_sterile_data') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "counts_sterile_data" jsonb;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'consent_notes') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "consent_notes" text;
  END IF;
END $$;
