-- Add SMS tracking fields to patient_questionnaire_links
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='sms_sent') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "sms_sent" boolean DEFAULT false NOT NULL;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='sms_sent_at') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "sms_sent_at" timestamp;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='sms_sent_to') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "sms_sent_to" varchar;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_questionnaire_links' AND column_name='sms_sent_by') THEN
    ALTER TABLE "patient_questionnaire_links" ADD COLUMN "sms_sent_by" varchar;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='patient_questionnaire_links_sms_sent_by_users_id_fk') THEN
    ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_sms_sent_by_users_id_fk" FOREIGN KEY ("sms_sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
