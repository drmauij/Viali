DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='provider_absences' AND column_name='notes') THEN
    ALTER TABLE "provider_absences" ADD COLUMN "notes" text;
  END IF;
END $$;
