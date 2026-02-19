DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'prescription'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'discharge_brief_type')
  ) THEN
    ALTER TYPE "public"."discharge_brief_type" ADD VALUE 'prescription';
  END IF;
END $$;
