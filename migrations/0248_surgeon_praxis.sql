-- 0248_surgeon_praxis.sql
-- Adds is_praxis flag and parent_surgeon_id self-FK to users.
-- Adds optional surgeon_id FK to external_surgery_requests for new portal-submitted requests.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_praxis BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS parent_surgeon_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_parent_surgeon_id_users_id_fk'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_parent_surgeon_id_users_id_fk
      FOREIGN KEY (parent_surgeon_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_parent_surgeon_id
  ON users(parent_surgeon_id);

ALTER TABLE external_surgery_requests
  ADD COLUMN IF NOT EXISTS surgeon_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'external_surgery_requests_surgeon_id_users_id_fk'
      AND conrelid = 'external_surgery_requests'::regclass
  ) THEN
    ALTER TABLE external_surgery_requests
      ADD CONSTRAINT external_surgery_requests_surgeon_id_users_id_fk
      FOREIGN KEY (surgeon_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_external_surgery_requests_surgeon_id
  ON external_surgery_requests(surgeon_id);
