-- Add info_flyer_url column to units table for unit info flyer PDF uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'units' AND column_name = 'info_flyer_url'
  ) THEN
    ALTER TABLE units ADD COLUMN info_flyer_url VARCHAR;
  END IF;
END $$;
