-- Add clinic_services table and update clinic_invoice_items for services support (idempotent)

-- Create clinic_services table
CREATE TABLE IF NOT EXISTS "clinic_services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hospital_id" varchar NOT NULL,
  "unit_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "description" text,
  "price" numeric(10, 2) NOT NULL,
  "is_shared" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add line_type column to clinic_invoice_items
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='clinic_invoice_items' AND column_name='line_type'
  ) THEN 
    ALTER TABLE "clinic_invoice_items" ADD COLUMN "line_type" varchar DEFAULT 'item' NOT NULL;
  END IF; 
END $$;

-- Add service_id column to clinic_invoice_items
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='clinic_invoice_items' AND column_name='service_id'
  ) THEN 
    ALTER TABLE "clinic_invoice_items" ADD COLUMN "service_id" varchar;
  END IF; 
END $$;

-- Add tax_rate column to clinic_invoice_items
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='clinic_invoice_items' AND column_name='tax_rate'
  ) THEN 
    ALTER TABLE "clinic_invoice_items" ADD COLUMN "tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL;
  END IF; 
END $$;

-- Add tax_amount column to clinic_invoice_items
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='clinic_invoice_items' AND column_name='tax_amount'
  ) THEN 
    ALTER TABLE "clinic_invoice_items" ADD COLUMN "tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL;
  END IF; 
END $$;

-- Add foreign key from clinic_services to hospitals
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_services_hospital_id_hospitals_id_fk'
  ) THEN 
    ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_hospital_id_hospitals_id_fk" 
    FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF; 
END $$;

-- Add foreign key from clinic_services to units
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_services_unit_id_units_id_fk'
  ) THEN 
    ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_unit_id_units_id_fk" 
    FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
  END IF; 
END $$;

-- Create indexes on clinic_services
CREATE INDEX IF NOT EXISTS "idx_clinic_services_hospital" ON "clinic_services" USING btree ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_clinic_services_unit" ON "clinic_services" USING btree ("unit_id");

-- Add foreign key from clinic_invoice_items to clinic_services
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_invoice_items_service_id_clinic_services_id_fk'
  ) THEN 
    ALTER TABLE "clinic_invoice_items" ADD CONSTRAINT "clinic_invoice_items_service_id_clinic_services_id_fk" 
    FOREIGN KEY ("service_id") REFERENCES "public"."clinic_services"("id") ON DELETE no action ON UPDATE no action;
  END IF; 
END $$;

-- Create index on clinic_invoice_items for service_id
CREATE INDEX IF NOT EXISTS "idx_clinic_invoice_items_service" ON "clinic_invoice_items" USING btree ("service_id");
