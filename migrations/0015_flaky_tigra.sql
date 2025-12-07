-- Migration 0015: Checklist Dismissals Table (Idempotent)

-- Create checklist_dismissals table
CREATE TABLE IF NOT EXISTS "checklist_dismissals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"dismissed_by" varchar NOT NULL,
	"dismissed_at" timestamp DEFAULT now(),
	"due_date" timestamp NOT NULL,
	"reason" text
);

-- Foreign keys for checklist_dismissals
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_dismissals_template_id_checklist_templates_id_fk') THEN
    ALTER TABLE "checklist_dismissals" ADD CONSTRAINT "checklist_dismissals_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_dismissals_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "checklist_dismissals" ADD CONSTRAINT "checklist_dismissals_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_dismissals_unit_id_units_id_fk') THEN
    ALTER TABLE "checklist_dismissals" ADD CONSTRAINT "checklist_dismissals_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_dismissals_dismissed_by_users_id_fk') THEN
    ALTER TABLE "checklist_dismissals" ADD CONSTRAINT "checklist_dismissals_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Indexes for checklist_dismissals
CREATE INDEX IF NOT EXISTS "idx_checklist_dismissals_template" ON "checklist_dismissals" USING btree ("template_id");
CREATE INDEX IF NOT EXISTS "idx_checklist_dismissals_hospital" ON "checklist_dismissals" USING btree ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_checklist_dismissals_unit" ON "checklist_dismissals" USING btree ("unit_id");
CREATE INDEX IF NOT EXISTS "idx_checklist_dismissals_dismissed_at" ON "checklist_dismissals" USING btree ("dismissed_at");
CREATE INDEX IF NOT EXISTS "idx_checklist_dismissals_due_date" ON "checklist_dismissals" USING btree ("due_date");
