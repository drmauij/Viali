CREATE TABLE "clinic_appointments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"service_id" varchar,
	"appointment_date" date NOT NULL,
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" varchar DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"reminder_sent" boolean DEFAULT false,
	"reminder_sent_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_absences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"timebutler_user_id" varchar,
	"absence_type" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_half_day_start" boolean DEFAULT false,
	"is_half_day_end" boolean DEFAULT false,
	"synced_at" timestamp DEFAULT now(),
	"external_id" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_external_absence" UNIQUE("hospital_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "provider_availability" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"slot_duration_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "provider_time_off" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar NOT NULL,
	"unit_id" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" varchar,
	"end_time" varchar,
	"reason" varchar,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timebutler_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"api_token" varchar,
	"user_mapping" jsonb,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" varchar,
	"last_sync_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "timebutler_config_hospital_id_unique" UNIQUE("hospital_id")
);
--> statement-breakpoint
ALTER TABLE "clinic_services" ADD COLUMN "duration_minutes" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_service_id_clinic_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."clinic_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_appointments" ADD CONSTRAINT "clinic_appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_absences" ADD CONSTRAINT "provider_absences_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_absences" ADD CONSTRAINT "provider_absences_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_availability" ADD CONSTRAINT "provider_availability_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_availability" ADD CONSTRAINT "provider_availability_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD CONSTRAINT "provider_time_off_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD CONSTRAINT "provider_time_off_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_time_off" ADD CONSTRAINT "provider_time_off_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timebutler_config" ADD CONSTRAINT "timebutler_config_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clinic_appointments_hospital" ON "clinic_appointments" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_clinic_appointments_unit" ON "clinic_appointments" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_clinic_appointments_patient" ON "clinic_appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "idx_clinic_appointments_provider" ON "clinic_appointments" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_clinic_appointments_date" ON "clinic_appointments" USING btree ("appointment_date");--> statement-breakpoint
CREATE INDEX "idx_clinic_appointments_status" ON "clinic_appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_provider_absences_provider" ON "provider_absences" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_provider_absences_hospital" ON "provider_absences" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "idx_provider_absences_dates" ON "provider_absences" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_provider_availability_provider" ON "provider_availability" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_provider_availability_unit" ON "provider_availability" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_provider_availability_day" ON "provider_availability" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "idx_provider_time_off_provider" ON "provider_time_off" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_provider_time_off_dates" ON "provider_time_off" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_timebutler_config_hospital" ON "timebutler_config" USING btree ("hospital_id");