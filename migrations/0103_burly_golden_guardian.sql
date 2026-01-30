CREATE TABLE IF NOT EXISTS "inventory_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_value" numeric(14, 2) NOT NULL,
	"item_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_unit_id_units_id_fk'
  ) THEN
    ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_snapshots_hospital_date" ON "inventory_snapshots" USING btree ("hospital_id","snapshot_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_snapshots_unit_date" ON "inventory_snapshots" USING btree ("unit_id","snapshot_date");
