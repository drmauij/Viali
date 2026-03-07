CREATE TABLE IF NOT EXISTS "tardoc_cumulation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"related_code" varchar NOT NULL,
	"rule_type" varchar NOT NULL,
	"description" text,
	"version" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tardoc_catalog" ADD COLUMN IF NOT EXISTS "max_quantity_per_session" integer;--> statement-breakpoint
ALTER TABLE "tardoc_catalog" ADD COLUMN IF NOT EXISTS "max_quantity_per_case" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_cumulation_code" ON "tardoc_cumulation_rules" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tardoc_cumulation_related" ON "tardoc_cumulation_rules" USING btree ("related_code");
