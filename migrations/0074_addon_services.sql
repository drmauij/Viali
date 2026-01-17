-- Add billing add-on service columns to hospitals table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_dispocura') THEN
    ALTER TABLE hospitals ADD COLUMN addon_dispocura boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_retell') THEN
    ALTER TABLE hospitals ADD COLUMN addon_retell boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_monitor') THEN
    ALTER TABLE hospitals ADD COLUMN addon_monitor boolean DEFAULT false;
  END IF;
END $$;
