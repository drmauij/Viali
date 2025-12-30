DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgery_preop_assessments' AND column_name='surgical_approval_status') THEN
    ALTER TABLE "surgery_preop_assessments" ADD COLUMN "surgical_approval_status" varchar;
  END IF;
END $$;
