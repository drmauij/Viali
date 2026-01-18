DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_documents' AND column_name = 'source') THEN
    ALTER TABLE patient_documents ADD COLUMN source varchar DEFAULT 'staff_upload';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_documents' AND column_name = 'reviewed') THEN
    ALTER TABLE patient_documents ADD COLUMN reviewed boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_documents' AND column_name = 'questionnaire_upload_id') THEN
    ALTER TABLE patient_documents ADD COLUMN questionnaire_upload_id varchar;
  END IF;
END $$;
