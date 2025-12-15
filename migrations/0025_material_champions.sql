DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'administrative_note') THEN
    ALTER TABLE "surgeries" ADD COLUMN "administrative_note" text;
  END IF;
END $$;
