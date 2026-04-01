DO $$ BEGIN CREATE TYPE "public"."meta_lead_contact_outcome" AS ENUM('reached', 'no_answer', 'wants_callback', 'will_call_back', 'needs_time'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."meta_lead_status" AS ENUM('new', 'in_progress', 'converted', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_lead_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meta_lead_id" varchar NOT NULL,
	"outcome" "meta_lead_contact_outcome" NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_lead_webhook_config" (
	"hospital_id" varchar PRIMARY KEY NOT NULL,
	"api_key" varchar NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar,
	"phone" varchar,
	"operation" varchar NOT NULL,
	"source" varchar NOT NULL,
	"meta_lead_id" varchar NOT NULL,
	"meta_form_id" varchar NOT NULL,
	"status" "meta_lead_status" DEFAULT 'new' NOT NULL,
	"patient_id" varchar,
	"appointment_id" varchar,
	"closed_reason" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_lead_contacts" ADD CONSTRAINT "meta_lead_contacts_meta_lead_id_meta_leads_id_fk" FOREIGN KEY ("meta_lead_id") REFERENCES "public"."meta_leads"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_lead_contacts" ADD CONSTRAINT "meta_lead_contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_lead_webhook_config" ADD CONSTRAINT "meta_lead_webhook_config_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_appointment_id_clinic_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."clinic_appointments"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_lead_contacts_lead_created" ON "meta_lead_contacts" USING btree ("meta_lead_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_leads_hospital_status_created" ON "meta_leads" USING btree ("hospital_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_leads_hospital_lead_id" ON "meta_leads" USING btree ("hospital_id","meta_lead_id");
