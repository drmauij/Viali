DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_uploads' AND column_name = 'reviewed') THEN
    ALTER TABLE patient_questionnaire_uploads ADD COLUMN reviewed boolean DEFAULT false;
  END IF;
END $$;
