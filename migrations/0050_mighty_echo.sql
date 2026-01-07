CREATE TABLE "calcom_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"api_key" varchar,
	"webhook_secret" varchar,
	"is_enabled" boolean DEFAULT false,
	"sync_busy_blocks" boolean DEFAULT true,
	"sync_timebutler_absences" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "calcom_config_hospital_id_unique" UNIQUE("hospital_id")
);
--> statement-breakpoint
CREATE TABLE "calcom_provider_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"calcom_event_type_id" varchar NOT NULL,
	"calcom_user_id" varchar,
	"calcom_schedule_id" varchar,
	"is_enabled" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"busy_block_mapping" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "idx_calcom_provider_mappings_unique" UNIQUE("hospital_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "calcom_config" ADD CONSTRAINT "calcom_config_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calcom_provider_mappings" ADD CONSTRAINT "calcom_provider_mappings_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calcom_provider_mappings" ADD CONSTRAINT "calcom_provider_mappings_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_calcom_config_hospital" ON "calcom_config" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_calcom_provider_mappings_hospital" ON "calcom_provider_mappings" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_calcom_provider_mappings_provider" ON "calcom_provider_mappings" USING btree ("provider_id");