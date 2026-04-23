-- Task 12 (multi-location groups): marketing promo codes get an optional
-- `group_wide` flag so a code issued at hospital A can be redeemed at any
-- sibling hospital in the same group. Default false preserves the existing
-- single-hospital redemption semantics for all pre-existing rows.
-- Statement is idempotent per repo convention.

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS group_wide boolean NOT NULL DEFAULT false;
