-- Add record locking fields to anesthesia_records
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false;
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "locked_at" timestamp;
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "locked_by" varchar REFERENCES "users"("id");
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "unlocked_at" timestamp;
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "unlocked_by" varchar REFERENCES "users"("id");
ALTER TABLE "anesthesia_records" ADD COLUMN IF NOT EXISTS "unlock_reason" text;
