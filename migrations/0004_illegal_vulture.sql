DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'stand_by') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "stand_by" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'stand_by_reason') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "stand_by_reason" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'stand_by_reason_note') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "stand_by_reason_note" text;
  END IF;
END $$;
