CREATE TABLE IF NOT EXISTS "clinic_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"is_bookable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_clinic_provider" UNIQUE("unit_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_providers_unit_id_units_id_fk') THEN
    ALTER TABLE "clinic_providers" ADD CONSTRAINT "clinic_providers_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_providers_user_id_users_id_fk') THEN
    ALTER TABLE "clinic_providers" ADD CONSTRAINT "clinic_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_providers_unit" ON "clinic_providers" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_providers_user" ON "clinic_providers" USING btree ("user_id");
