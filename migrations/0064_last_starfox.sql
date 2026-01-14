-- Create worker_contracts table if it doesn't exist
CREATE TABLE IF NOT EXISTS "worker_contracts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hospital_id" varchar NOT NULL,
  "first_name" varchar NOT NULL,
  "last_name" varchar NOT NULL,
  "street" varchar NOT NULL,
  "postal_code" varchar NOT NULL,
  "city" varchar NOT NULL,
  "phone" varchar,
  "email" varchar NOT NULL,
  "date_of_birth" date NOT NULL,
  "iban" varchar NOT NULL,
  "role" varchar NOT NULL,
  "status" varchar DEFAULT 'pending_manager_signature' NOT NULL,
  "worker_signature" text,
  "worker_signed_at" timestamp,
  "worker_signature_location" varchar,
  "manager_signature" text,
  "manager_signed_at" timestamp,
  "manager_id" varchar,
  "manager_name" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add contract_token column to hospitals if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'hospitals' AND column_name = 'contract_token'
  ) THEN
    ALTER TABLE "hospitals" ADD COLUMN "contract_token" varchar;
  END IF;
END $$;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'worker_contracts_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "worker_contracts" ADD CONSTRAINT "worker_contracts_hospital_id_hospitals_id_fk" 
      FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'worker_contracts_manager_id_users_id_fk'
  ) THEN
    ALTER TABLE "worker_contracts" ADD CONSTRAINT "worker_contracts_manager_id_users_id_fk" 
      FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "idx_worker_contracts_hospital" ON "worker_contracts" USING btree ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_worker_contracts_status" ON "worker_contracts" USING btree ("status");

-- Add unique constraint on contract_token if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'hospitals_contract_token_unique'
  ) THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_contract_token_unique" UNIQUE("contract_token");
  END IF;
END $$;
