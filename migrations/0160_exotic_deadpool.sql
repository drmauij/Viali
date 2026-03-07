CREATE TABLE IF NOT EXISTS "tpw_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"canton" varchar(2) NOT NULL,
	"insurer_gln" varchar(13),
	"law_type" varchar(10),
	"tp_value_al" numeric(6, 4),
	"tp_value_tl" numeric(6, 4),
	"tp_value" numeric(6, 4) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tpw_rates_hospital" ON "tpw_rates" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tpw_rates_lookup" ON "tpw_rates" USING btree ("hospital_id","canton","law_type","insurer_gln");
