-- ============================================================================
--  PREFLIGHT for migration 0246_backfill_medication_config_admin_group_uuid
--  Run this on the production DB BEFORE deploying. Read-only — no writes.
--  Tells you:
--    1. How many rows the migration will update.
--    2. Which rows would be SKIPPED because converting them would collide
--       with an existing UUID-stored config (manual reconciliation needed).
--    3. Whether any hospital has duplicate-name admin_groups (the LATERAL
--       order-by picks one deterministically; surface so you know about it).
--    4. Sanity counts before / after expectation.
-- ============================================================================

\echo
\echo '=== 1. Storage breakdown BEFORE migration ==='
SELECT
  CASE
    WHEN mc.administration_group IS NULL THEN 'NULL (orphan)'
    WHEN mc.administration_group ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'UUID (correct)'
    ELSE 'STRING NAME (legacy — will be migrated)'
  END AS storage_type,
  COUNT(*) AS rows
FROM medication_configs mc
GROUP BY 1
ORDER BY 1;

\echo
\echo '=== 2. Rows the migration WILL update (dry run) ==='
SELECT
  i.hospital_id,
  i.name AS item_name,
  mc.administration_group AS legacy_value,
  ag.id AS will_become_uuid,
  ag.name AS resolved_group_name
FROM medication_configs mc
JOIN items i ON i.id = mc.item_id
LEFT JOIN LATERAL (
  SELECT id, name FROM administration_groups
  WHERE hospital_id = i.hospital_id AND name = mc.administration_group
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1
) ag ON TRUE
WHERE mc.administration_group IS NOT NULL
  AND mc.administration_group !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ag.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM medication_configs other
    WHERE other.item_id = mc.item_id
      AND other.administration_group = ag.id
      AND other.id <> mc.id
  )
ORDER BY i.hospital_id, item_name;

\echo
\echo '=== 3. Rows that WILL BE SKIPPED (collision — manual reconciliation needed) ==='
\echo '    (these legacy-string rows would create a duplicate (item_id, admin_group)'
\echo '     against an existing UUID-stored config; they stay untouched until cleaned up)'
SELECT
  i.hospital_id,
  i.name AS item_name,
  mc.id AS legacy_config_id,
  mc.administration_group AS legacy_value,
  ag.id AS would_collide_with_uuid,
  conflict.id AS existing_config_id
FROM medication_configs mc
JOIN items i ON i.id = mc.item_id
JOIN LATERAL (
  SELECT id FROM administration_groups
  WHERE hospital_id = i.hospital_id AND name = mc.administration_group
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1
) ag ON TRUE
JOIN medication_configs conflict
  ON conflict.item_id = mc.item_id
  AND conflict.administration_group = ag.id
  AND conflict.id <> mc.id
WHERE mc.administration_group IS NOT NULL
  AND mc.administration_group !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY i.hospital_id, item_name;

\echo
\echo '=== 4. Rows where NO matching admin_group name exists in the hospital ==='
\echo '    (unfixable by this migration; manual decision: rename group OR drop config)'
SELECT
  i.hospital_id,
  i.name AS item_name,
  mc.id AS legacy_config_id,
  mc.administration_group AS legacy_value
FROM medication_configs mc
JOIN items i ON i.id = mc.item_id
LEFT JOIN administration_groups ag
  ON ag.hospital_id = i.hospital_id AND ag.name = mc.administration_group
WHERE mc.administration_group IS NOT NULL
  AND mc.administration_group !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ag.id IS NULL
ORDER BY i.hospital_id, item_name;

\echo
\echo '=== 5. Duplicate admin_group names within the same hospital ==='
\echo '    (the migration picks one deterministically; review if surprising)'
SELECT
  hospital_id,
  name,
  COUNT(*) AS duplicates,
  array_agg(id ORDER BY created_at NULLS LAST, id) AS group_ids
FROM administration_groups
GROUP BY hospital_id, name
HAVING COUNT(*) > 1
ORDER BY hospital_id, name;
