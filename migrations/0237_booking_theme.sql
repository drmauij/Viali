-- Migration 0237: per-clinic / per-chain booking page theme.
-- Five tokens stored as a single jsonb column on both hospitals and
-- hospital_groups so the shape can grow without further migrations.
-- Idempotent.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS booking_theme jsonb;

ALTER TABLE hospital_groups
  ADD COLUMN IF NOT EXISTS booking_theme jsonb;
