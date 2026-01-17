ALTER TABLE "billing_invoices" ADD COLUMN "worktime_price" numeric(10, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "hospitals" ADD COLUMN "addon_worktime" boolean DEFAULT false;