ALTER TABLE "billing_invoices" ADD COLUMN "surgery_price" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "logistics_price" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "clinic_price" numeric(10, 2) DEFAULT '0';