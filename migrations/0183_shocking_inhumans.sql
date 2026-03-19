ALTER TABLE "clinic_appointments" ADD COLUMN IF NOT EXISTS "no_show_fee_acknowledged_at" timestamp;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "no_show_fee_message" text;