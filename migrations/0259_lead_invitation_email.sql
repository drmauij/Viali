-- 0259_lead_invitation_email.sql
-- Lead invitation email + booking attribution.
-- Adds per-clinic toggle, optional per-hospital HMAC secret, per-lead send
-- tracking, and a leadId column on referral_events for downstream analytics.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS auto_send_lead_invitation_email BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS lead_attribution_secret VARCHAR;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS invitation_email_sent_at TIMESTAMP;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS invitation_email_error TEXT;

ALTER TABLE referral_events
  ADD COLUMN IF NOT EXISTS lead_id VARCHAR;

DO $$ BEGIN
  ALTER TABLE referral_events
    ADD CONSTRAINT referral_events_lead_id_fk
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS referral_events_lead_id_idx
  ON referral_events(lead_id) WHERE lead_id IS NOT NULL;
