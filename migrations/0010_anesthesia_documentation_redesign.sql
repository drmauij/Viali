-- Add anesthesia_overview column to anesthesia_records
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "anesthesia_overview" jsonb;

-- Create anesthesia_installations table
CREATE TABLE IF NOT EXISTS "anesthesia_installations" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "anesthesia_record_id" varchar NOT NULL,
        "category" varchar NOT NULL,
        "location" varchar,
        "attempts" integer,
        "notes" text,
        "metadata" jsonb,
        "placement_time" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);

-- Create anesthesia_technique_details table
CREATE TABLE IF NOT EXISTS "anesthesia_technique_details" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "anesthesia_record_id" varchar NOT NULL,
        "technique" varchar NOT NULL,
        "details" jsonb,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "anesthesia_installations" ADD CONSTRAINT "anesthesia_installations_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "anesthesia_technique_details" ADD CONSTRAINT "anesthesia_technique_details_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_installations_record" ON "anesthesia_installations" USING btree ("anesthesia_record_id");
CREATE INDEX IF NOT EXISTS "idx_installations_category" ON "anesthesia_installations" USING btree ("category");
CREATE INDEX IF NOT EXISTS "idx_technique_details_record" ON "anesthesia_technique_details" USING btree ("anesthesia_record_id");
CREATE INDEX IF NOT EXISTS "idx_technique_details_technique" ON "anesthesia_technique_details" USING btree ("technique");
