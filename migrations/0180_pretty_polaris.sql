CREATE TABLE IF NOT EXISTS "clinic_day_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"date" date NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "idx_clinic_day_notes_hospital_date" UNIQUE("hospital_id","date")
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "clinic_day_notes" ADD CONSTRAINT "clinic_day_notes_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "clinic_day_notes" ADD CONSTRAINT "clinic_day_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "clinic_day_notes" ADD CONSTRAINT "clinic_day_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_day_notes_hospital" ON "clinic_day_notes" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_day_notes_date" ON "clinic_day_notes" USING btree ("date");
