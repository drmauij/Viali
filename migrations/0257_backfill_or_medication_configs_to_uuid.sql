-- Re-apply the UUID conversion for medication_configs rows whose group
-- belongs to an OR administration_group. Companion to 0246/0247.
--
-- Background: 0246/0247 flipped every legacy NAME-stored administration_group
-- value to its UUID. On 2026-05-08 a hot-fix (data-only UPDATE on prod) put
-- OR-typed configs back into name-storage because the OR-medications code
-- path still expected names, causing the Infiltration & Medications card to
-- render "No medications configured" on every group. The local dev DB was
-- aligned the same way.
--
-- Now that the OR code path is UUID-aware (server filter compares against
-- group IDs; OrMedicationsCard keys configured items by group UUID; add /
-- remove dialogs send the UUID), it is safe to roll the OR rows forward to
-- UUID-storage again. Anesthesia rows are already UUIDs and untouched.
--
-- Safety guarantees built into this migration:
--   1. Scoped to administration_groups.unit_type = 'or' — anesthesia rows
--      stay untouched (they are already UUIDs).
--   2. Idempotent: rows whose value already matches the UUID regex are
--      skipped, so re-running is a no-op.
--   3. No duplicates: the WHERE NOT EXISTS guard skips any row whose
--      conversion would collide with an existing UUID-stored config for the
--      same (item, target group). Such legacy rows stay as-is — they remain
--      invisible until manually reconciled, but the migration cannot
--      violate the unique index on (item_id, administration_group).
--   4. Deterministic pick when an admin_groups name appears more than once
--      in the same hospital: the LATERAL subquery orders by created_at
--      then id and takes one.

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
      AND unit_type = 'or'
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
