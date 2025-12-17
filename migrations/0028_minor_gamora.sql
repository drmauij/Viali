DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='units' AND column_name='questionnaire_phone') THEN
    ALTER TABLE "units" ADD COLUMN "questionnaire_phone" varchar;
  END IF;
END $$;
