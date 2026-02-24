DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_episodes' AND column_name = 'end_date') THEN
    ALTER TABLE "patient_episodes" ADD COLUMN "end_date" timestamp;
  END IF;
END $$;
