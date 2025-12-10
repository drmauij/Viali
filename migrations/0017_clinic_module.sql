-- Migration 0017: Clinic Module (Idempotent)
-- Creates clinic invoicing tables and adds required columns
-- All statements use IF NOT EXISTS for safe re-running

-- Add company info columns to hospitals table (for invoicing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_name') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_name" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_street') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_street" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_postal_code') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_postal_code" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_city') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_city" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_phone') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_phone" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_fax') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_fax" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_email') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_email" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'company_logo_url') THEN
    ALTER TABLE "hospitals" ADD COLUMN "company_logo_url" varchar;
  END IF;
END $$;--> statement-breakpoint

-- Add patient_price column to items table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'patient_price') THEN
    ALTER TABLE "items" ADD COLUMN "patient_price" numeric(10, 2);
  END IF;
END $$;--> statement-breakpoint

-- Add is_clinic_module column to units table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'units' AND column_name = 'is_clinic_module') THEN
    ALTER TABLE "units" ADD COLUMN "is_clinic_module" boolean DEFAULT false;
  END IF;
END $$;--> statement-breakpoint

-- Create clinic_invoices table
CREATE TABLE IF NOT EXISTS "clinic_invoices" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hospital_id" varchar NOT NULL,
  "invoice_number" integer NOT NULL,
  "date" timestamp DEFAULT now() NOT NULL,
  "patient_id" varchar,
  "customer_name" text NOT NULL,
  "customer_address" text,
  "subtotal" numeric(10, 2) NOT NULL,
  "vat_rate" numeric(5, 2) DEFAULT '7.7' NOT NULL,
  "vat_amount" numeric(10, 2) NOT NULL,
  "total" numeric(10, 2) NOT NULL,
  "comments" text,
  "status" varchar DEFAULT 'draft',
  "created_by" varchar,
  "created_at" timestamp DEFAULT now()
);--> statement-breakpoint

-- Create clinic_invoice_items table
CREATE TABLE IF NOT EXISTS "clinic_invoice_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" varchar NOT NULL,
  "item_id" varchar,
  "description" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_price" numeric(10, 2) NOT NULL,
  "total" numeric(10, 2) NOT NULL
);--> statement-breakpoint

-- Add foreign key constraints (only if they don't exist)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'clinic_invoices_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "clinic_invoices" ADD CONSTRAINT "clinic_invoices_hospital_id_hospitals_id_fk" 
      FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'clinic_invoices_patient_id_patients_id_fk'
  ) THEN
    ALTER TABLE "clinic_invoices" ADD CONSTRAINT "clinic_invoices_patient_id_patients_id_fk" 
      FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'clinic_invoices_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "clinic_invoices" ADD CONSTRAINT "clinic_invoices_created_by_users_id_fk" 
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'clinic_invoice_items_invoice_id_clinic_invoices_id_fk'
  ) THEN
    ALTER TABLE "clinic_invoice_items" ADD CONSTRAINT "clinic_invoice_items_invoice_id_clinic_invoices_id_fk" 
      FOREIGN KEY ("invoice_id") REFERENCES "public"."clinic_invoices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'clinic_invoice_items_item_id_items_id_fk'
  ) THEN
    ALTER TABLE "clinic_invoice_items" ADD CONSTRAINT "clinic_invoice_items_item_id_items_id_fk" 
      FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Create indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "idx_clinic_invoices_hospital" ON "clinic_invoices" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_invoices_patient" ON "clinic_invoices" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_invoices_status" ON "clinic_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_invoices_date" ON "clinic_invoices" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_invoice_items_invoice" ON "clinic_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_invoice_items_item" ON "clinic_invoice_items" USING btree ("item_id");
