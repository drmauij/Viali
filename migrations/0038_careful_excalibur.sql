-- Add stock runway alert configuration columns to hospitals table (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hospitals' AND column_name='runway_target_days') THEN
    ALTER TABLE "hospitals" ADD COLUMN "runway_target_days" integer DEFAULT 14;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hospitals' AND column_name='runway_warning_days') THEN
    ALTER TABLE "hospitals" ADD COLUMN "runway_warning_days" integer DEFAULT 7;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hospitals' AND column_name='runway_lookback_days') THEN
    ALTER TABLE "hospitals" ADD COLUMN "runway_lookback_days" integer DEFAULT 30;
  END IF;
END $$;
