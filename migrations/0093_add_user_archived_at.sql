-- Add archivedAt column to users table for soft delete functionality
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'archived_at') THEN
    ALTER TABLE users ADD COLUMN archived_at timestamp;
  END IF;
END $$;
