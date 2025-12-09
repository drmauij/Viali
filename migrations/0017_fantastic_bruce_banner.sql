CREATE TABLE "ambulatory_invoice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"item_id" varchar,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ambulatory_invoices" (
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
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "patient_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "ambulatory_invoice_items" ADD CONSTRAINT "ambulatory_invoice_items_invoice_id_ambulatory_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."ambulatory_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambulatory_invoice_items" ADD CONSTRAINT "ambulatory_invoice_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambulatory_invoices" ADD CONSTRAINT "ambulatory_invoices_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambulatory_invoices" ADD CONSTRAINT "ambulatory_invoices_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ambulatory_invoices" ADD CONSTRAINT "ambulatory_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ambulatory_invoice_items_invoice" ON "ambulatory_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_ambulatory_invoice_items_item" ON "ambulatory_invoice_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_ambulatory_invoices_hospital" ON "ambulatory_invoices" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_ambulatory_invoices_patient" ON "ambulatory_invoices" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_ambulatory_invoices_status" ON "ambulatory_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ambulatory_invoices_date" ON "ambulatory_invoices" USING btree ("date");