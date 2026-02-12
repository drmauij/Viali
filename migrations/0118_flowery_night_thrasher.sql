CREATE TABLE IF NOT EXISTS "surgery_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"intra_op_data" jsonb,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surgery_set_inventory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_discharge_medications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" varchar NOT NULL,
	"hospital_id" varchar NOT NULL,
	"doctor_id" varchar,
	"notes" text,
	"signature" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_discharge_medication_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discharge_medication_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_type" varchar DEFAULT 'packs' NOT NULL,
	"administration_route" varchar,
	"frequency" varchar,
	"notes" text,
	"end_price" numeric(10, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_sets" ADD CONSTRAINT "surgery_sets_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_sets" ADD CONSTRAINT "surgery_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_set_inventory" ADD CONSTRAINT "surgery_set_inventory_set_id_surgery_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."surgery_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_set_inventory" ADD CONSTRAINT "surgery_set_inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_set_inventory" ADD CONSTRAINT "uq_surgery_set_inventory" UNIQUE ("set_id", "item_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medication_items" ADD CONSTRAINT "patient_discharge_medication_items_discharge_medication_id_patient_discharge_medications_id_fk" FOREIGN KEY ("discharge_medication_id") REFERENCES "public"."patient_discharge_medications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medication_items" ADD CONSTRAINT "patient_discharge_medication_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medications" ADD CONSTRAINT "patient_discharge_medications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medications" ADD CONSTRAINT "patient_discharge_medications_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medications" ADD CONSTRAINT "patient_discharge_medications_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "patient_discharge_medications" ADD CONSTRAINT "patient_discharge_medications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_sets_hospital" ON "surgery_sets" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_set_inventory_set" ON "surgery_set_inventory" USING btree ("set_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_set_inventory_item" ON "surgery_set_inventory" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_med_items_slot" ON "patient_discharge_medication_items" USING btree ("discharge_medication_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_med_items_item" ON "patient_discharge_medication_items" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_meds_patient" ON "patient_discharge_medications" USING btree ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_meds_hospital" ON "patient_discharge_medications" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_meds_doctor" ON "patient_discharge_medications" USING btree ("doctor_id");
