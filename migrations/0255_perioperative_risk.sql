ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS risk_grade text;
ALTER TABLE surgeries ADD COLUMN IF NOT EXISTS perioperative_risk jsonb;
CREATE INDEX IF NOT EXISTS idx_surgeries_risk_grade ON surgeries(hospital_id, risk_grade);
ALTER TABLE patient_questionnaire_responses ADD COLUMN IF NOT EXISTS functionally_dependent boolean;
