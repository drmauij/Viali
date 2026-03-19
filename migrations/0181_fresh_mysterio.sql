CREATE TABLE IF NOT EXISTS "referral_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar NOT NULL,
	"appointment_id" varchar,
	"source" varchar NOT NULL,
	"source_detail" varchar,
	"utm_source" varchar,
	"utm_medium" varchar,
	"utm_campaign" varchar,
	"utm_term" varchar,
	"utm_content" varchar,
	"ref_param" varchar,
	"capture_method" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE cascade;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_patient_id_patients_id_fk') THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_appointment_id_clinic_appointments_id_fk') THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_appointment_id_clinic_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "clinic_appointments"("id") ON DELETE set null;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "referral_events_hospital_created" ON "referral_events" ("hospital_id", "created_at");
CREATE INDEX IF NOT EXISTS "referral_events_appointment_id" ON "referral_events" ("appointment_id");
CREATE INDEX IF NOT EXISTS "referral_events_patient_id" ON "referral_events" ("patient_id");

ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "enable_referral_on_booking" boolean DEFAULT false;
