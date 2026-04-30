-- Migration 0243: Questionnaire caregiver-as-emergency-contact consent
-- Adds a per-response consent flag indicating whether the patient agrees that
-- their outpatient caregiver (Begleitperson) should also be saved as the
-- emergency contact on their patient record. Only honoured server-side when
-- the questionnaire link is bound to a surgery.
-- Idempotent.

ALTER TABLE patient_questionnaire_responses
  ADD COLUMN IF NOT EXISTS caregiver_is_emergency_contact boolean DEFAULT true;
