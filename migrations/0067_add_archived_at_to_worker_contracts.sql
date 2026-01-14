-- Add archived_at column to worker_contracts table for archiving contracts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'worker_contracts' AND column_name = 'archived_at') THEN
    ALTER TABLE worker_contracts ADD COLUMN archived_at timestamp;
  END IF;
END $$;
