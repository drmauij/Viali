DO $$ BEGIN
  CREATE TYPE "public"."ad_funnel" AS ENUM ('google_ads', 'meta_ads', 'meta_forms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ad_budgets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL REFERENCES "hospitals"("id") ON DELETE CASCADE,
  "month" varchar(7) NOT NULL,
  "funnel" "public"."ad_funnel" NOT NULL,
  "amount_chf" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ad_budgets_hospital_month_funnel" ON "ad_budgets" ("hospital_id", "month", "funnel");
