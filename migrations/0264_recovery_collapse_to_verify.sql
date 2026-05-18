-- 0264_recovery_collapse_to_verify.sql
-- Collapse the now-defunct to_verify status into rescheduled. The To Verify
-- review step turned out to be confusion rather than value-add — successor
-- detection now auto-closes the case as rescheduled directly. Any row left
-- behind in to_verify from the brief period it was reachable gets stamped
-- with closed_at = NOW() and closed_by = NULL (system close, no user).
--
-- The enum value 'to_verify' stays in the type — Postgres makes removing
-- enum values painful and there's no functional benefit to dropping it.
-- Idempotent: no-op if no rows match.

UPDATE recovery_cases
SET status = 'rescheduled',
    closed_at = COALESCE(closed_at, NOW()),
    closed_by = NULL,
    updated_at = NOW()
WHERE status = 'to_verify';
