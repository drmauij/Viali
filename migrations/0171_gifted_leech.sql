ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "booking_token" varchar;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "booking_settings" jsonb;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospitals_booking_token_unique') THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_booking_token_unique" UNIQUE("booking_token");
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_appointments_no_double_book"
ON "clinic_appointments" ("provider_id", "appointment_date", "start_time")
WHERE status NOT IN ('cancelled', 'no_show');
