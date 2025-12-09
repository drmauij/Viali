-- Idempotent migration: Add columns only if they don't exist

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_catalogs' AND column_name = 'browser_login_url') THEN
    ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_login_url" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_catalogs' AND column_name = 'browser_username') THEN
    ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_username" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_catalogs' AND column_name = 'browser_session_encrypted') THEN
    ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_session_encrypted" text;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_catalogs' AND column_name = 'browser_last_login') THEN
    ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_last_login" timestamp;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'admission_time') THEN
    ALTER TABLE "surgeries" ADD COLUMN "admission_time" timestamp;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'price') THEN
    ALTER TABLE "surgeries" ADD COLUMN "price" numeric(10, 2);
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'quote_sent_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "quote_sent_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'invoice_sent_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "invoice_sent_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'payment_status') THEN
    ALTER TABLE "surgeries" ADD COLUMN "payment_status" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'payment_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "payment_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'payment_method') THEN
    ALTER TABLE "surgeries" ADD COLUMN "payment_method" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'payment_notes') THEN
    ALTER TABLE "surgeries" ADD COLUMN "payment_notes" text;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'treatment_contract_sent_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "treatment_contract_sent_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'treatment_contract_received_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "treatment_contract_received_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'anesthesia_consent_sent') THEN
    ALTER TABLE "surgeries" ADD COLUMN "anesthesia_consent_sent" boolean DEFAULT false;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'implant_order_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "implant_order_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'implant_received_date') THEN
    ALTER TABLE "surgeries" ADD COLUMN "implant_received_date" date;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'implant_vendor') THEN
    ALTER TABLE "surgeries" ADD COLUMN "implant_vendor" varchar;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'implant_details') THEN
    ALTER TABLE "surgeries" ADD COLUMN "implant_details" text;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_surgeries_payment_status" ON "surgeries" USING btree ("payment_status");
