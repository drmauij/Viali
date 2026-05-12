-- 0251_patient_documents_portal_share.sql
-- Adds patient-portal sharing flags to patient_documents so the clinic can
-- expose individual staff-uploaded files (wound photos, lab reports, imaging
-- referrals) to the patient under the "Dateien" tab in the portal.
-- Mirrors the column shape used by note_attachments (migration 0250) and
-- discharge_briefs. Unlike those, unshare preserves portal_shared_at and
-- portal_shared_by as audit data (per spec).

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS portal_shared_at TIMESTAMP;

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS portal_shared_by VARCHAR REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_portal_visible
  ON patient_documents (portal_visible);
