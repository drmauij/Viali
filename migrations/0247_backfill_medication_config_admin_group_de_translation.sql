-- Companion to 0246. Where 0246 handles the simple "legacy string equals
-- current admin_group name" case, this migration handles the German →
-- English translation case observed on production:
--   Antibiotika      → Antibiotics
--   Infusionen       → Infusions
--   Kurz-Infusionen  → Short IVs
--   Perfusoren       → Pumps
--
-- Context: most production hospitals run with the default English-named
-- administration_groups (Antibiotics, Bolus, Infusions, Pumps, Short IVs).
-- A few medication_configs rows on three of those hospitals (Swiss Central
-- Clinic AG, mediga medical center, Viali Clinic) carry legacy German
-- strings in their administration_group column — left over from an
-- earlier seed/import. They never matched any admin_group name, so the
-- corresponding medications were invisible on the chart.
--
-- This migration translates each legacy German string to the existing
-- English admin_group's UUID in the same hospital. It does NOT touch
-- hospitals that legitimately use German group names (those rows aren't
-- legacy strings — they're already UUIDs pointing at German-named groups).
--
-- Safety guarantees mirror 0246:
--   1. Idempotent — already-UUID values are skipped by the regex.
--   2. NOT EXISTS guard — rows whose conversion would collide with an
--      existing UUID-stored config for the same (item, group) are left
--      as-is. The migration cannot violate the unique index.
--   3. Per-hospital scoping — translation only applies within the same
--      hospital (via items.hospital_id = administration_groups.hospital_id).

WITH translation_map(legacy_name, current_name) AS (
  VALUES
    ('Antibiotika',     'Antibiotics'),
    ('Infusionen',      'Infusions'),
    ('Kurz-Infusionen', 'Short IVs'),
    ('Perfusoren',      'Pumps')
)
UPDATE medication_configs mc
SET administration_group = resolved.new_group_id
FROM (
  SELECT mc_inner.id AS config_id, mc_inner.item_id, ag.id AS new_group_id
  FROM medication_configs mc_inner
  JOIN items i ON i.id = mc_inner.item_id
  JOIN translation_map tm ON tm.legacy_name = mc_inner.administration_group
  JOIN administration_groups ag
    ON ag.hospital_id = i.hospital_id
    AND ag.name = tm.current_name
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
