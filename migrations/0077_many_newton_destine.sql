-- Add new addon columns for module-based billing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_surgery') THEN
    ALTER TABLE hospitals ADD COLUMN addon_surgery boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_logistics') THEN
    ALTER TABLE hospitals ADD COLUMN addon_logistics boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_clinic') THEN
    ALTER TABLE hospitals ADD COLUMN addon_clinic boolean DEFAULT false;
  END IF;
END $$;
