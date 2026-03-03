CREATE TABLE IF NOT EXISTS "tardoc_invoice_template_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"tardoc_code" varchar NOT NULL,
	"description" varchar NOT NULL,
	"tax_points" numeric(10, 2),
	"scaling_factor" numeric(5, 2) DEFAULT '1.00',
	"side_code" varchar,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardoc_invoice_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"billing_model" varchar,
	"law_type" varchar,
	"treatment_type" varchar DEFAULT 'ambulatory',
	"treatment_reason" varchar DEFAULT 'disease',
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoice_template_items_template_id_tardoc_invoice_templates_id_fk') THEN
    ALTER TABLE "tardoc_invoice_template_items" ADD CONSTRAINT "tardoc_invoice_template_items_template_id_tardoc_invoice_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tardoc_invoice_templates"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoice_templates_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "tardoc_invoice_templates" ADD CONSTRAINT "tardoc_invoice_templates_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_template_items_template" ON "tardoc_invoice_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_templates_hospital" ON "tardoc_invoice_templates" USING btree ("hospital_id");