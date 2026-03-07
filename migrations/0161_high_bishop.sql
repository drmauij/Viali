CREATE TABLE IF NOT EXISTS "ambulante_pauschalen_catalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"description_de" text NOT NULL,
	"description_fr" text,
	"category" varchar,
	"base_price" numeric(10, 2) NOT NULL,
	"price_unit" varchar DEFAULT 'flat',
	"valid_from" date,
	"valid_to" date,
	"version" varchar DEFAULT '1.1c',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ambulante_pauschalen_catalog_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "tardoc_invoice_items" ADD COLUMN IF NOT EXISTS "tariff_type" varchar DEFAULT '590';--> statement-breakpoint
ALTER TABLE "tardoc_invoices" ADD COLUMN IF NOT EXISTS "tariff_system" varchar DEFAULT 'tardoc';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ap_catalog_code" ON "ambulante_pauschalen_catalog" USING btree ("code");
