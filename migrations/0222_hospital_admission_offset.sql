-- Migration 0222: add default_admission_offset_minutes to hospitals
-- Stores the per-hospital default number of minutes before the planned surgery
-- start when the patient should arrive (admission time offset).
-- Idempotent: safe to run multiple times.

ALTER TABLE "hospitals"
  ADD COLUMN IF NOT EXISTS "default_admission_offset_minutes" integer DEFAULT 60 NOT NULL;
