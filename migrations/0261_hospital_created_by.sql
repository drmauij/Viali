-- 0261_hospital_created_by.sql
-- Add nullable created_by_user_id FK on hospitals so we can definitively
-- track who provisioned each clinic — used by the praxis-activation gate so
-- a surgeon who already created their praxis no longer sees the "Activate"
-- banner. Existing hospitals stay NULL (we don't try to infer the creator
-- from historical roles).

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hospitals_created_by_user_id_users_id_fk'
      AND conrelid = 'hospitals'::regclass
  ) THEN
    ALTER TABLE hospitals
      ADD CONSTRAINT hospitals_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hospitals_created_by_user_id
  ON hospitals(created_by_user_id);
