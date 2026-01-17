DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'trial_start_date') THEN
    ALTER TABLE hospitals ADD COLUMN trial_start_date timestamp;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_questionnaire') THEN
    ALTER TABLE hospitals ADD COLUMN addon_questionnaire boolean DEFAULT true;
  END IF;
END $$;

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

ALTER TABLE hospitals ALTER COLUMN license_type SET DEFAULT 'test';
