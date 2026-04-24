-- Chain Module Phase C: flow_hospitals join table enables chain campaigns to
-- target any subset of locations (1, N, or all). Before this migration the
-- send-loop widened audiences via the X-Active-Scope header; after this
-- migration the send-loop reads the explicit list from flow_hospitals.
--
-- Backfill strategy: every existing flow gets one row = its current
-- flows.hospital_id. That preserves behaviour 1:1 — a pre-migration flow
-- keeps sending to exactly the one hospital it always did.

-- 1. Table (composite PK + secondary index for reverse lookup)
CREATE TABLE IF NOT EXISTS flow_hospitals (
  flow_id varchar NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  hospital_id varchar NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  PRIMARY KEY (flow_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_hospitals_hospital ON flow_hospitals(hospital_id);

-- 2. Backfill: every existing flow gets one row = its current hospital_id.
-- ON CONFLICT DO NOTHING makes this safe to re-run.
INSERT INTO flow_hospitals (flow_id, hospital_id)
SELECT id, hospital_id FROM flows
ON CONFLICT (flow_id, hospital_id) DO NOTHING;
