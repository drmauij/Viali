DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_medications' AND column_name = 'initial_bolus') THEN
    ALTER TABLE "anesthesia_medications" ADD COLUMN "initial_bolus" varchar;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'no_pre_op_required') THEN
    ALTER TABLE "surgeries" ADD COLUMN "no_pre_op_required" boolean DEFAULT false NOT NULL;
  END IF;
END $$;