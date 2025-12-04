CREATE TABLE "item_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"gtin" varchar,
	"pharmacode" varchar,
	"swissmedic_nr" varchar,
	"migel" varchar,
	"atc" varchar,
	"manufacturer" varchar,
	"manufacturer_ref" varchar,
	"pack_content" varchar,
	"units_per_pack" integer,
	"content_per_unit" varchar,
	"abgabekategorie" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "item_codes_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "price_sync_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"job_type" varchar DEFAULT 'full_sync' NOT NULL,
	"total_items" integer DEFAULT 0,
	"processed_items" integer DEFAULT 0,
	"matched_items" integer DEFAULT 0,
	"updated_items" integer DEFAULT 0,
	"progress_percent" integer DEFAULT 0,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"summary" text,
	"triggered_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_catalogs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"supplier_name" varchar NOT NULL,
	"supplier_type" varchar DEFAULT 'api' NOT NULL,
	"api_base_url" varchar,
	"customer_number" varchar,
	"credential_secret_key" varchar,
	"is_enabled" boolean DEFAULT true,
	"sync_schedule" varchar DEFAULT 'manual',
	"last_sync_at" timestamp,
	"last_sync_status" varchar,
	"last_sync_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"supplier_name" varchar NOT NULL,
	"article_code" varchar,
	"catalog_url" varchar,
	"basispreis" numeric(10, 2),
	"publikumspreis" numeric(10, 2),
	"currency" varchar DEFAULT 'CHF',
	"is_preferred" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"last_price_update" timestamp,
	"last_checked" timestamp,
	"match_confidence" numeric(3, 2),
	"match_status" varchar DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "item_codes" ADD CONSTRAINT "item_codes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sync_jobs" ADD CONSTRAINT "price_sync_jobs_catalog_id_supplier_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."supplier_catalogs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sync_jobs" ADD CONSTRAINT "price_sync_jobs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sync_jobs" ADD CONSTRAINT "price_sync_jobs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_catalogs" ADD CONSTRAINT "supplier_catalogs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_codes" ADD CONSTRAINT "supplier_codes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_item_codes_item" ON "item_codes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_item_codes_gtin" ON "item_codes" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "idx_item_codes_pharmacode" ON "item_codes" USING btree ("pharmacode");--> statement-breakpoint
CREATE INDEX "idx_price_sync_jobs_catalog" ON "price_sync_jobs" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "idx_price_sync_jobs_hospital" ON "price_sync_jobs" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_price_sync_jobs_status" ON "price_sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_supplier_catalogs_hospital" ON "supplier_catalogs" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_catalogs_supplier" ON "supplier_catalogs" USING btree ("supplier_name");--> statement-breakpoint
CREATE INDEX "idx_supplier_codes_item" ON "supplier_codes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_codes_supplier" ON "supplier_codes" USING btree ("supplier_name");--> statement-breakpoint
CREATE INDEX "idx_supplier_codes_preferred" ON "supplier_codes" USING btree ("is_preferred");