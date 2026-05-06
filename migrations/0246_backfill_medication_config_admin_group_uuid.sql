-- Backfill medication_configs.administration_group from legacy NAME storage
-- to UUID storage, matching the corresponding administration_groups row by
-- name within the same hospital (joined via items.hospital_id).
--
-- Background: medication_configs.administration_group is a varchar that, in
-- the original schema, stored the group's display name (e.g. "Antibiotics",
-- "Bolus"). It was later switched to store the foreign-key UUID of the
-- corresponding administration_groups row, and new code joins by ag.id =
-- mc.administration_group. Older configs were never migrated, so anything
-- still holding a legacy name string never joins, so the medication is
-- invisible on the anesthesia chart even though the picker treats it as
-- "configured".
--
-- This migration is idempotent: rows whose value already matches the UUID
-- regex are skipped by the WHERE clause below; a second run does nothing.

UPDATE medication_configs mc
SET administration_group = ag.id
FROM items i, administration_groups ag
WHERE mc.item_id = i.id
  AND ag.hospital_id = i.hospital_id
  AND ag.name = mc.administration_group
  AND mc.administration_group IS NOT NULL
  AND mc.administration_group !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
