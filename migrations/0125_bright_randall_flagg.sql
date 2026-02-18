CREATE TABLE IF NOT EXISTS "discharge_medication_template_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_type" varchar DEFAULT 'packs' NOT NULL,
	"administration_route" varchar,
	"frequency" varchar,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discharge_medication_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "patient_discharge_medications" ADD COLUMN IF NOT EXISTS "surgery_id" varchar;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_medication_template_items" ADD CONSTRAINT "discharge_medication_template_items_template_id_discharge_medication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."discharge_medication_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_medication_template_items" ADD CONSTRAINT "discharge_medication_template_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_medication_templates" ADD CONSTRAINT "discharge_medication_templates_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "discharge_medication_templates" ADD CONSTRAINT "discharge_medication_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_med_tmpl_items_template" ON "discharge_medication_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_med_templates_hospital" ON "discharge_medication_templates" USING btree ("hospital_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medications" ADD CONSTRAINT "patient_discharge_medications_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
