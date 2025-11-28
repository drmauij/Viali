ALTER TABLE "inventory_commits" ADD COLUMN "unit_id" varchar;--> statement-breakpoint
ALTER TABLE "inventory_commits" ADD CONSTRAINT "inventory_commits_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_commits_unit" ON "inventory_commits" USING btree ("unit_id");