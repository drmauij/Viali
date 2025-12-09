ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_login_url" varchar;--> statement-breakpoint
ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_username" varchar;--> statement-breakpoint
ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_session_encrypted" text;--> statement-breakpoint
ALTER TABLE "supplier_catalogs" ADD COLUMN "browser_last_login" timestamp;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "admission_time" timestamp;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "quote_sent_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "invoice_sent_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "payment_status" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "payment_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "payment_method" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "payment_notes" text;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "treatment_contract_sent_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "treatment_contract_received_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "anesthesia_consent_sent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "implant_order_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "implant_received_date" date;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "implant_vendor" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "implant_details" text;--> statement-breakpoint
CREATE INDEX "idx_surgeries_payment_status" ON "surgeries" USING btree ("payment_status");