ALTER TABLE "hospitals" ALTER COLUMN "timezone" SET DEFAULT 'Europe/Zurich';--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'currency') THEN
    ALTER TABLE "hospitals" ADD COLUMN "currency" varchar DEFAULT 'CHF';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'date_format') THEN
    ALTER TABLE "hospitals" ADD COLUMN "date_format" varchar DEFAULT 'european';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'hour_format') THEN
    ALTER TABLE "hospitals" ADD COLUMN "hour_format" varchar DEFAULT '24h';
  END IF;
END $$;
