DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'units' AND column_name = 'show_controlled_medications') THEN
    ALTER TABLE units ADD COLUMN show_controlled_medications boolean DEFAULT false;
  END IF;
END $$;
