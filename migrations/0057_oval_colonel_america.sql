-- Add showInventory column to units (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='units' AND column_name='show_inventory') THEN
    ALTER TABLE "units" ADD COLUMN "show_inventory" boolean DEFAULT true;
  END IF;
END $$;--> statement-breakpoint

-- Add showAppointments column to units (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='units' AND column_name='show_appointments') THEN
    ALTER TABLE "units" ADD COLUMN "show_appointments" boolean DEFAULT true;
  END IF;
END $$;
