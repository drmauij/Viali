-- Migration 0223: add treatment_inventory_source_unit_type to hospitals
-- Selects which unit's inventory the Treatment module uses:
--   'clinic' (default) or 'or' (surgery unit).
-- Idempotent: safe to run multiple times.

ALTER TABLE "hospitals"
  ADD COLUMN IF NOT EXISTS "treatment_inventory_source_unit_type" varchar DEFAULT 'clinic' NOT NULL;
