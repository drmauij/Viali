ALTER TABLE "patient_discharge_medications" ADD COLUMN IF NOT EXISTS "inventory_committed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patient_discharge_medications" ADD COLUMN IF NOT EXISTS "inventory_committed_by" varchar;--> statement-breakpoint
ALTER TABLE "patient_discharge_medications" ADD COLUMN IF NOT EXISTS "inventory_signature" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_discharge_medications_inventory_committed_by_users_id_fk') THEN
    ALTER TABLE "patient_discharge_medications" ADD CONSTRAINT "patient_discharge_medications_inventory_committed_by_users_id_fk" FOREIGN KEY ("inventory_committed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
