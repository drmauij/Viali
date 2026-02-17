CREATE TABLE IF NOT EXISTS "staff_pool_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"user_id" varchar,
	"name" varchar NOT NULL,
	"role" varchar NOT NULL,
	"recurrence_pattern" varchar NOT NULL,
	"recurrence_days_of_week" integer[],
	"recurrence_days_of_month" integer[],
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_staff_pool' AND column_name = 'rule_id'
  ) THEN
    ALTER TABLE "daily_staff_pool" ADD COLUMN "rule_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'staff_pool_rules_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "staff_pool_rules" ADD CONSTRAINT "staff_pool_rules_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'staff_pool_rules_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "staff_pool_rules" ADD CONSTRAINT "staff_pool_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'staff_pool_rules_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "staff_pool_rules" ADD CONSTRAINT "staff_pool_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_pool_rules_hospital" ON "staff_pool_rules" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_pool_rules_user" ON "staff_pool_rules" USING btree ("user_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'daily_staff_pool_rule_id_staff_pool_rules_id_fk'
  ) THEN
    ALTER TABLE "daily_staff_pool" ADD CONSTRAINT "daily_staff_pool_rule_id_staff_pool_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."staff_pool_rules"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_daily_staff_pool_rule_date_unique"
  ON "daily_staff_pool" ("rule_id", "date")
  WHERE "rule_id" IS NOT NULL;
