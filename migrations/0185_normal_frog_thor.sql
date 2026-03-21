CREATE TABLE IF NOT EXISTS "clinic_service_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "clinic_services" ADD COLUMN IF NOT EXISTS "code" varchar;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_service_providers_service_id_clinic_services_id_fk') THEN
    ALTER TABLE "clinic_service_providers" ADD CONSTRAINT "clinic_service_providers_service_id_clinic_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."clinic_services"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinic_service_providers_provider_id_users_id_fk') THEN
    ALTER TABLE "clinic_service_providers" ADD CONSTRAINT "clinic_service_providers_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_clinic_service_providers_unique" ON "clinic_service_providers" USING btree ("service_id","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_service_providers_service" ON "clinic_service_providers" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_service_providers_provider" ON "clinic_service_providers" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_clinic_services_hospital_code" ON "clinic_services" USING btree ("hospital_id","code") WHERE code IS NOT NULL;
