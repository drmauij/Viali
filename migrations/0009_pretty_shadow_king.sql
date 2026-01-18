DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_medications' AND column_name = 'note') THEN
    ALTER TABLE "anesthesia_medications" ADD COLUMN "note" varchar;
  END IF;
END $$;
