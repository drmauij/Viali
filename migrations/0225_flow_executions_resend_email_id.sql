-- Migration 0225: track Resend message IDs on flow executions
-- Lets the webhook map incoming events back to a flow_execution row.
-- Partial index — most rows have NULL (SMS sends, transactional sends).
-- Idempotent.

ALTER TABLE "flow_executions"
  ADD COLUMN IF NOT EXISTS "resend_email_id" varchar;

CREATE INDEX IF NOT EXISTS "idx_flow_executions_resend_email_id"
  ON "flow_executions" ("resend_email_id")
  WHERE "resend_email_id" IS NOT NULL;
