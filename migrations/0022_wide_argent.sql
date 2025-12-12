CREATE TABLE IF NOT EXISTS "surgeon_checklist_template_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surgeon_checklist_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"owner_user_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surgery_preop_checklist_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surgery_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_surgery_item" UNIQUE("surgery_id","item_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeon_checklist_template_items_template_id_surgeon_checklist_templates_id_fk') THEN
    ALTER TABLE "surgeon_checklist_template_items" ADD CONSTRAINT "surgeon_checklist_template_items_template_id_surgeon_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."surgeon_checklist_templates"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeon_checklist_templates_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "surgeon_checklist_templates" ADD CONSTRAINT "surgeon_checklist_templates_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgeon_checklist_templates_owner_user_id_users_id_fk') THEN
    ALTER TABLE "surgeon_checklist_templates" ADD CONSTRAINT "surgeon_checklist_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgery_preop_checklist_entries_surgery_id_surgeries_id_fk') THEN
    ALTER TABLE "surgery_preop_checklist_entries" ADD CONSTRAINT "surgery_preop_checklist_entries_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgery_preop_checklist_entries_template_id_surgeon_checklist_templates_id_fk') THEN
    ALTER TABLE "surgery_preop_checklist_entries" ADD CONSTRAINT "surgery_preop_checklist_entries_template_id_surgeon_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."surgeon_checklist_templates"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgery_preop_checklist_entries_item_id_surgeon_checklist_template_items_id_fk') THEN
    ALTER TABLE "surgery_preop_checklist_entries" ADD CONSTRAINT "surgery_preop_checklist_entries_item_id_surgeon_checklist_template_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."surgeon_checklist_template_items"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeon_checklist_items_template" ON "surgeon_checklist_template_items" USING btree ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeon_checklist_templates_hospital" ON "surgeon_checklist_templates" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeon_checklist_templates_owner" ON "surgeon_checklist_templates" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_checklist_entries_surgery" ON "surgery_preop_checklist_entries" USING btree ("surgery_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_checklist_entries_template" ON "surgery_preop_checklist_entries" USING btree ("template_id");
