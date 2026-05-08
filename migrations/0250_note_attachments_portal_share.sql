-- 0250_note_attachments_portal_share.sql
-- Adds patient-portal sharing flags to note_attachments so the clinic can
-- expose individual pictures (wound photos, X-rays, etc.) to the patient
-- under the new "Dateien" tab in the portal. Mirrors the discharge_briefs
-- portal_visible / portal_shared_at / portal_shared_by trio.

ALTER TABLE note_attachments
  ADD COLUMN IF NOT EXISTS portal_visible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE note_attachments
  ADD COLUMN IF NOT EXISTS portal_shared_at TIMESTAMP;

ALTER TABLE note_attachments
  ADD COLUMN IF NOT EXISTS portal_shared_by VARCHAR REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_note_attachments_portal_visible
  ON note_attachments (portal_visible);
