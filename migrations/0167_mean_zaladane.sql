CREATE TABLE IF NOT EXISTS "clinic_closures" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"name" varchar NOT NULL,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clinic_closures" ADD CONSTRAINT "clinic_closures_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clinic_closures" ADD CONSTRAINT "clinic_closures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_closures_hospital" ON "clinic_closures" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clinic_closures_dates" ON "clinic_closures" USING btree ("start_date","end_date");
