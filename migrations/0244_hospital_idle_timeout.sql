-- Migration 0244: Per-hospital staff idle-timeout auto-logout
-- Adds two configurable settings on the hospitals row:
--   idle_timeout_minutes  : 0 = disabled (default). Otherwise log out after N minutes idle.
--   idle_warning_seconds  : countdown shown to the user before forced logout (default 30s).
-- Applies only to staff (passport) sessions, not patient portal sessions.
-- Idempotent.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS idle_warning_seconds integer NOT NULL DEFAULT 30;
