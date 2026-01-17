-- Migration 0075: Add questionnaire add-on column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'addon_questionnaire') THEN
    ALTER TABLE hospitals ADD COLUMN addon_questionnaire boolean DEFAULT true;
  END IF;
END $$;

-- Update all existing hospitals to have questionnaire enabled by default
UPDATE hospitals SET addon_questionnaire = true WHERE addon_questionnaire IS NULL;
