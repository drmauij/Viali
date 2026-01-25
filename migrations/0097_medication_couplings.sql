-- Idempotent migration for medication couplings and record medications

-- Create anesthesia_record_medications table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anesthesia_record_medications') THEN
    CREATE TABLE "anesthesia_record_medications" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "anesthesia_record_id" varchar NOT NULL,
      "medication_config_id" varchar NOT NULL,
      "imported_at" timestamp DEFAULT now(),
      "imported_by" varchar,
      CONSTRAINT "uq_record_medication" UNIQUE("anesthesia_record_id","medication_config_id")
    );
  END IF;
END $$;

-- Create medication_couplings table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medication_couplings') THEN
    CREATE TABLE "medication_couplings" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "primary_medication_config_id" varchar NOT NULL,
      "coupled_medication_config_id" varchar NOT NULL,
      "default_dose" varchar,
      "notes" text,
      "hospital_id" varchar,
      "unit_id" varchar,
      "created_at" timestamp DEFAULT now(),
      "created_by" varchar,
      CONSTRAINT "uq_medication_coupling" UNIQUE("primary_medication_config_id","coupled_medication_config_id")
    );
  END IF;
END $$;

-- Add on_demand_only column to medication_configs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'medication_configs' AND column_name = 'on_demand_only') THEN
    ALTER TABLE "medication_configs" ADD COLUMN "on_demand_only" boolean DEFAULT false;
  END IF;
END $$;

-- Add foreign keys for anesthesia_record_medications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_record_medications_anesthesia_record_id_anesthesia_records_id_fk') THEN
    ALTER TABLE "anesthesia_record_medications" ADD CONSTRAINT "anesthesia_record_medications_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_record_medications_medication_config_id_medication_configs_id_fk') THEN
    ALTER TABLE "anesthesia_record_medications" ADD CONSTRAINT "anesthesia_record_medications_medication_config_id_medication_configs_id_fk" FOREIGN KEY ("medication_config_id") REFERENCES "public"."medication_configs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_record_medications_imported_by_users_id_fk') THEN
    ALTER TABLE "anesthesia_record_medications" ADD CONSTRAINT "anesthesia_record_medications_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Add foreign keys for medication_couplings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'medication_couplings_primary_medication_config_id_medication_configs_id_fk') THEN
    ALTER TABLE "medication_couplings" ADD CONSTRAINT "medication_couplings_primary_medication_config_id_medication_configs_id_fk" FOREIGN KEY ("primary_medication_config_id") REFERENCES "public"."medication_configs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'medication_couplings_coupled_medication_config_id_medication_configs_id_fk') THEN
    ALTER TABLE "medication_couplings" ADD CONSTRAINT "medication_couplings_coupled_medication_config_id_medication_configs_id_fk" FOREIGN KEY ("coupled_medication_config_id") REFERENCES "public"."medication_configs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'medication_couplings_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "medication_couplings" ADD CONSTRAINT "medication_couplings_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'medication_couplings_unit_id_units_id_fk') THEN
    ALTER TABLE "medication_couplings" ADD CONSTRAINT "medication_couplings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'medication_couplings_created_by_users_id_fk') THEN
    ALTER TABLE "medication_couplings" ADD CONSTRAINT "medication_couplings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Create indexes for anesthesia_record_medications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_record_medications_record') THEN
    CREATE INDEX "idx_record_medications_record" ON "anesthesia_record_medications" USING btree ("anesthesia_record_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_record_medications_config') THEN
    CREATE INDEX "idx_record_medications_config" ON "anesthesia_record_medications" USING btree ("medication_config_id");
  END IF;
END $$;

-- Create indexes for medication_couplings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_medication_couplings_primary') THEN
    CREATE INDEX "idx_medication_couplings_primary" ON "medication_couplings" USING btree ("primary_medication_config_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_medication_couplings_coupled') THEN
    CREATE INDEX "idx_medication_couplings_coupled" ON "medication_couplings" USING btree ("coupled_medication_config_id");
  END IF;
END $$;
