DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'sms_consent') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "sms_consent" boolean DEFAULT false;
  END IF;
END $$;
