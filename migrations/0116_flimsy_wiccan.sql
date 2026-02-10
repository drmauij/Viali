CREATE TABLE IF NOT EXISTS "checklist_template_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"unit_id" varchar,
	"role" varchar
);
--> statement-breakpoint
ALTER TABLE "checklist_templates" ALTER COLUMN "unit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "room_id" varchar;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "exclude_weekends" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checklist_template_assignments" ADD CONSTRAINT "checklist_template_assignments_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checklist_template_assignments" ADD CONSTRAINT "checklist_template_assignments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checklist_template_assignments_template" ON "checklist_template_assignments" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_checklist_template_assignments_unit" ON "checklist_template_assignments" USING btree ("unit_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_room_id_surgery_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
INSERT INTO "checklist_template_assignments" ("template_id", "unit_id", "role")
SELECT "id", "unit_id", "role" FROM "checklist_templates"
WHERE "unit_id" IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM "checklist_template_assignments" WHERE "template_id" = "checklist_templates"."id"
);
