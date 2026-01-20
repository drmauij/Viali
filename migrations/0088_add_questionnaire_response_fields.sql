-- Add missing fields to patient_questionnaire_responses (idempotent)

-- Dental status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'dental_issues') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "dental_issues" jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'dental_notes') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "dental_notes" text;
  END IF;
END $$;

-- PONV & Transfusion history
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'ponv_transfusion_issues') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "ponv_transfusion_issues" jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'ponv_transfusion_notes') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "ponv_transfusion_notes" text;
  END IF;
END $$;

-- Drug use
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'drug_use') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "drug_use" jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'drug_use_details') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "drug_use_details" text;
  END IF;
END $$;

-- Outpatient caregiver contact
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'outpatient_caregiver_first_name') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "outpatient_caregiver_first_name" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'outpatient_caregiver_last_name') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "outpatient_caregiver_last_name" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_questionnaire_responses' AND column_name = 'outpatient_caregiver_phone') THEN
    ALTER TABLE "patient_questionnaire_responses" ADD COLUMN "outpatient_caregiver_phone" varchar;
  END IF;
END $$;
