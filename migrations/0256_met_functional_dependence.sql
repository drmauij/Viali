ALTER TABLE surgery_preop_assessments ADD COLUMN IF NOT EXISTS met_above_4 boolean;
ALTER TABLE surgery_preop_assessments ADD COLUMN IF NOT EXISTS functionally_dependent boolean;
ALTER TABLE preop_assessments ADD COLUMN IF NOT EXISTS met_above_4 boolean;
ALTER TABLE preop_assessments ADD COLUMN IF NOT EXISTS functionally_dependent boolean;
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS met_above_4 boolean;
