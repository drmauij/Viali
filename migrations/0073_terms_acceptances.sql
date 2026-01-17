-- Terms acceptances table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'terms_acceptances') THEN
    CREATE TABLE "terms_acceptances" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "hospital_id" varchar NOT NULL,
      "version" varchar DEFAULT '1.0' NOT NULL,
      "signed_by_user_id" varchar NOT NULL,
      "signed_by_name" varchar NOT NULL,
      "signed_by_email" varchar NOT NULL,
      "signature_image" text NOT NULL,
      "signed_at" timestamp DEFAULT now() NOT NULL,
      "pdf_url" varchar,
      "email_sent_at" timestamp,
      "countersigned_at" timestamp,
      "countersigned_by_name" varchar,
      "created_at" timestamp DEFAULT now(),
      CONSTRAINT "idx_terms_acceptances_hospital_version" UNIQUE("hospital_id","version")
    );
  END IF;
END $$;

-- Add foreign keys if not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'terms_acceptances_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'terms_acceptances_signed_by_user_id_users_id_fk') THEN
    ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Create indexes if not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_acceptances_hospital') THEN
    CREATE INDEX "idx_terms_acceptances_hospital" ON "terms_acceptances" USING btree ("hospital_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_terms_acceptances_version') THEN
    CREATE INDEX "idx_terms_acceptances_version" ON "terms_acceptances" USING btree ("version");
  END IF;
END $$;

-- Add stripe columns to hospitals if not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE "hospitals" ADD COLUMN "stripe_customer_id" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'stripe_payment_method_id') THEN
    ALTER TABLE "hospitals" ADD COLUMN "stripe_payment_method_id" varchar;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'price_per_record') THEN
    ALTER TABLE "hospitals" ADD COLUMN "price_per_record" numeric(10, 2);
  END IF;
END $$;
