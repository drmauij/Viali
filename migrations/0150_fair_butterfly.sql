CREATE TABLE IF NOT EXISTS "tardoc_catalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"description_de" text NOT NULL,
	"description_fr" text,
	"chapter" varchar,
	"chapter_description" text,
	"tax_points" numeric(10, 2),
	"medical_interpretation" numeric(10, 2),
	"technical_interpretation" numeric(10, 2),
	"duration_minutes" integer,
	"side_code" varchar,
	"valid_from" date,
	"valid_to" date,
	"version" varchar DEFAULT '1.3.2' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "tardoc_catalog_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardoc_invoice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"tardoc_code" varchar NOT NULL,
	"description" text NOT NULL,
	"treatment_date" date NOT NULL,
	"session" integer DEFAULT 1,
	"quantity" integer DEFAULT 1 NOT NULL,
	"tax_points" numeric(10, 2) NOT NULL,
	"tp_value" numeric(6, 4) NOT NULL,
	"scaling_factor" numeric(5, 2) DEFAULT '1.00',
	"side_code" varchar,
	"provider_gln" varchar,
	"amount_al" numeric(10, 2),
	"amount_tl" numeric(10, 2),
	"amount_chf" numeric(10, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '0',
	"vat_amount" numeric(10, 2) DEFAULT '0',
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardoc_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"invoice_number" integer NOT NULL,
	"patient_id" varchar,
	"surgery_id" varchar,
	"billing_model" varchar NOT NULL,
	"treatment_type" varchar DEFAULT 'ambulatory',
	"treatment_reason" varchar DEFAULT 'disease',
	"law_type" varchar NOT NULL,
	"case_number" varchar,
	"case_date" date,
	"case_date_end" date,
	"treatment_canton" varchar,
	"biller_gln" varchar,
	"biller_zsr" varchar,
	"provider_gln" varchar,
	"provider_zsr" varchar,
	"referring_physician_gln" varchar,
	"insurer_gln" varchar,
	"insurer_name" varchar,
	"insurance_number" varchar,
	"ahv_number" varchar,
	"patient_surname" varchar,
	"patient_first_name" varchar,
	"patient_birthday" varchar,
	"patient_sex" varchar,
	"patient_street" varchar,
	"patient_postal_code" varchar,
	"patient_city" varchar,
	"tp_value" numeric(6, 4),
	"subtotal_tp" numeric(10, 2),
	"subtotal_chf" numeric(10, 2),
	"vat_amount" numeric(10, 2) DEFAULT '0',
	"total_chf" numeric(10, 2),
	"status" varchar DEFAULT 'draft' NOT NULL,
	"xml_exported_at" timestamp,
	"pdf_exported_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tardoc_service_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"clinic_service_id" varchar NOT NULL,
	"tardoc_code" varchar NOT NULL,
	"tax_points" numeric(10, 2),
	"scaling_factor" numeric(5, 2) DEFAULT '1.00',
	"side_code" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_tardoc_mapping" UNIQUE("hospital_id","clinic_service_id","tardoc_code")
);
--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "company_gln" varchar;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "company_zsr" varchar;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "default_tp_value" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "company_bank_iban" varchar;--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "company_bank_name" varchar;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "insurer_gln" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gln" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "zsr_number" varchar;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoice_items_invoice_id_tardoc_invoices_id_fk') THEN
    ALTER TABLE "tardoc_invoice_items" ADD CONSTRAINT "tardoc_invoice_items_invoice_id_tardoc_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."tardoc_invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoices_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "tardoc_invoices" ADD CONSTRAINT "tardoc_invoices_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoices_patient_id_patients_id_fk') THEN
    ALTER TABLE "tardoc_invoices" ADD CONSTRAINT "tardoc_invoices_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoices_surgery_id_surgeries_id_fk') THEN
    ALTER TABLE "tardoc_invoices" ADD CONSTRAINT "tardoc_invoices_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_invoices_created_by_users_id_fk') THEN
    ALTER TABLE "tardoc_invoices" ADD CONSTRAINT "tardoc_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_service_mappings_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "tardoc_service_mappings" ADD CONSTRAINT "tardoc_service_mappings_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tardoc_service_mappings_clinic_service_id_clinic_services_id_fk') THEN
    ALTER TABLE "tardoc_service_mappings" ADD CONSTRAINT "tardoc_service_mappings_clinic_service_id_clinic_services_id_fk" FOREIGN KEY ("clinic_service_id") REFERENCES "public"."clinic_services"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_catalog_code" ON "tardoc_catalog" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_catalog_description" ON "tardoc_catalog" USING gin (to_tsvector('german', "description_de"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_invoice_items_invoice" ON "tardoc_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_invoices_hospital" ON "tardoc_invoices" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_invoices_patient" ON "tardoc_invoices" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_invoices_status" ON "tardoc_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_invoices_surgery" ON "tardoc_invoices" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_invoices_date" ON "tardoc_invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_mappings_hospital" ON "tardoc_service_mappings" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_mappings_service" ON "tardoc_service_mappings" USING btree ("clinic_service_id");