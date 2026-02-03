DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'surgery_side') THEN
    ALTER TABLE "surgeries" ADD COLUMN "surgery_side" varchar;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'antibiose_prophylaxe') THEN
    ALTER TABLE "surgeries" ADD COLUMN "antibiose_prophylaxe" boolean DEFAULT false;
  END IF;
END $$;
