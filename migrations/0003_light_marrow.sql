DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'emergency_no_signature') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "emergency_no_signature" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'send_email_copy') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "send_email_copy" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'email_for_copy') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "email_for_copy" varchar;
  END IF;
END $$;
