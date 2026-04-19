-- Migration 0226: webhook idempotency for flow_events
-- Adds svix_id column for Resend retry de-duplication.
-- Partial unique index ensures one (execution_id, event_type, svix_id) tuple per non-null svix_id.
-- Send-loop-written rows (svix_id NULL) are unconstrained.
-- Idempotent.

ALTER TABLE "flow_events"
  ADD COLUMN IF NOT EXISTS "svix_id" varchar;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_flow_events_execution_event_svix"
  ON "flow_events" ("execution_id", "event_type", "svix_id")
  WHERE "svix_id" IS NOT NULL;
