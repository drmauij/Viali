DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_commits' AND column_name = 'unit_id') THEN
    ALTER TABLE "inventory_commits" ADD COLUMN "unit_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'inventory_commits_unit_id_units_id_fk') THEN
    ALTER TABLE "inventory_commits" ADD CONSTRAINT "inventory_commits_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inventory_commits_unit" ON "inventory_commits" USING btree ("unit_id");
