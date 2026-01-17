DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'questionnaire_disabled') THEN
    ALTER TABLE "hospitals" ADD COLUMN "questionnaire_disabled" boolean DEFAULT false;
  END IF;
END $$;