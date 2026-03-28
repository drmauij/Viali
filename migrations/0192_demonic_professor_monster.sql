CREATE TABLE IF NOT EXISTS "or_medications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"group_id" varchar NOT NULL,
	"quantity" varchar NOT NULL,
	"unit" varchar NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "administration_groups" ADD COLUMN IF NOT EXISTS "unit_type" varchar DEFAULT 'anesthesia';--> statement-breakpoint
UPDATE administration_groups SET unit_type = 'anesthesia' WHERE unit_type IS NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "or_medications" ADD CONSTRAINT "or_medications_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "or_medications" ADD CONSTRAINT "or_medications_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "or_medications" ADD CONSTRAINT "or_medications_group_id_administration_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."administration_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_or_medications_record_item_group" ON "or_medications" USING btree ("anesthesia_record_id","item_id","group_id");
