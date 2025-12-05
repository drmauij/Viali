-- Surgery Staff Entries table for assigning staff to surgery/anesthesia cases
CREATE TABLE IF NOT EXISTS "surgery_staff_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL REFERENCES "anesthesia_records"("id") ON DELETE CASCADE,
	"role" varchar NOT NULL,
	"user_id" varchar REFERENCES "users"("id"),
	"name" varchar NOT NULL,
	"created_by" varchar REFERENCES "users"("id"),
	"created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_surgery_staff_entries_record" ON "surgery_staff_entries" ("anesthesia_record_id");
