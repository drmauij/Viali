DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinic_appointments' AND column_name='actual_start_time') THEN
    ALTER TABLE "clinic_appointments" ADD COLUMN "actual_start_time" timestamp;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinic_appointments' AND column_name='actual_end_time') THEN
    ALTER TABLE "clinic_appointments" ADD COLUMN "actual_end_time" timestamp;
  END IF;
END $$;
