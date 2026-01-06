-- Add email language and sent timestamp columns to preop_assessments
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'preop_assessments' AND column_name = 'email_language'
  ) THEN 
    ALTER TABLE "preop_assessments" ADD COLUMN "email_language" varchar DEFAULT 'de';
  END IF;
END $$;--> statement-breakpoint

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'preop_assessments' AND column_name = 'email_sent_at'
  ) THEN 
    ALTER TABLE "preop_assessments" ADD COLUMN "email_sent_at" timestamp;
  END IF;
END $$;
