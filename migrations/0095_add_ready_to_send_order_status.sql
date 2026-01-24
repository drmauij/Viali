-- Add ready_to_send as a valid order status
-- No schema changes needed as status is a varchar field, just documenting the new value
-- Status values: draft, ready_to_send, sent, received

-- Note: The orders.status column is a varchar, not an enum, so no migration is needed.
-- This file exists purely to document the addition of the 'ready_to_send' status.
