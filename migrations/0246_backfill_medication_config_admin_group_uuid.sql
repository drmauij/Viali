-- Backfill medication_configs.administration_group from legacy NAME storage
-- to UUID storage, matching the corresponding administration_groups row by
-- name within the same hospital (joined via items.hospital_id).
--
-- Background: medication_configs.administration_group is a varchar that, in
-- the original schema, stored the group's display name (e.g. "Antibiotics",
-- "Bolus"). It was later switched to store the foreign-key UUID of the
-- corresponding administration_groups row. Older configs were never
-- migrated, so anything still holding a legacy name string never joins via
-- ag.id = mc.administration_group, so the medication is invisible on the
-- anesthesia chart even though the picker treats it as "configured".
--
-- Safety guarantees built into this migration:
--   1. Idempotent: rows whose value already matches the UUID regex are
--      skipped, so re-running is a no-op.
--   2. No duplicates: the WHERE NOT EXISTS guard skips any row whose
--      conversion would collide with an existing UUID-stored config for the
--      same (item, target group). Such legacy rows stay as-is — they remain
--      invisible until manually reconciled, but the migration cannot
--      violate the unique index on (item_id, administration_group).
--   3. Deterministic pick when an admin_groups name appears more than once
--      in the same hospital: the LATERAL subquery orders by created_at
--      then id and takes one. (No collision is possible here because we
--      only INSERT existing-id values; the unique constraint above is on
--      medication_configs, not administration_groups.)

UPDATE medication_configs mc
SET administration_group = resolved.new_group_id
FROM (
  SELECT
    mc_inner.id AS config_id,
    mc_inner.item_id,
    ag.id AS new_group_id
  FROM medication_configs mc_inner
  JOIN items i ON i.id = mc_inner.item_id
  JOIN LATERAL (
    SELECT id
    FROM administration_groups
    WHERE hospital_id = i.hospital_id
      AND name = mc_inner.administration_group
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1
  ) ag ON TRUE
  WHERE mc_inner.administration_group IS NOT NULL
    AND mc_inner.administration_group !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
) AS resolved
WHERE mc.id = resolved.config_id
  AND NOT EXISTS (
    SELECT 1 FROM medication_configs other
    WHERE other.item_id = resolved.item_id
      AND other.administration_group = resolved.new_group_id
      AND other.id <> resolved.config_id
  );
