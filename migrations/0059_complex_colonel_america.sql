-- Cal.com bidirectional sync: Add tracking columns to appointments and surgeries
-- Add Cal.com user mapping to provider roles

-- clinic_appointments: calcom_booking_uid
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinic_appointments' AND column_name='calcom_booking_uid') THEN
    ALTER TABLE "clinic_appointments" ADD COLUMN "calcom_booking_uid" varchar;
  END IF;
END $$;--> statement-breakpoint

-- clinic_appointments: calcom_synced_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinic_appointments' AND column_name='calcom_synced_at') THEN
    ALTER TABLE "clinic_appointments" ADD COLUMN "calcom_synced_at" timestamp;
  END IF;
END $$;--> statement-breakpoint

-- clinic_appointments: calcom_source
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinic_appointments' AND column_name='calcom_source') THEN
    ALTER TABLE "clinic_appointments" ADD COLUMN "calcom_source" varchar DEFAULT 'local';
  END IF;
END $$;--> statement-breakpoint

-- surgeries: calcom_busy_block_uid
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgeries' AND column_name='calcom_busy_block_uid') THEN
    ALTER TABLE "surgeries" ADD COLUMN "calcom_busy_block_uid" varchar;
  END IF;
END $$;--> statement-breakpoint

-- surgeries: calcom_synced_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surgeries' AND column_name='calcom_synced_at') THEN
    ALTER TABLE "surgeries" ADD COLUMN "calcom_synced_at" timestamp;
  END IF;
END $$;--> statement-breakpoint

-- user_hospital_roles: calcom_user_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_hospital_roles' AND column_name='calcom_user_id') THEN
    ALTER TABLE "user_hospital_roles" ADD COLUMN "calcom_user_id" integer;
  END IF;
END $$;--> statement-breakpoint

-- user_hospital_roles: calcom_event_type_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_hospital_roles' AND column_name='calcom_event_type_id') THEN
    ALTER TABLE "user_hospital_roles" ADD COLUMN "calcom_event_type_id" integer;
  END IF;
END $$;--> statement-breakpoint

-- Index for clinic_appointments calcom lookup
CREATE INDEX IF NOT EXISTS "idx_clinic_appointments_calcom" ON "clinic_appointments" USING btree ("calcom_booking_uid");--> statement-breakpoint

-- Index for surgeries calcom lookup
CREATE INDEX IF NOT EXISTS "idx_surgeries_calcom" ON "surgeries" USING btree ("calcom_busy_block_uid");
