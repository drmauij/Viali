-- Consolidated migration: surgery_staff_entries, column rename, and user access controls
-- This migration safely handles:
-- 1. Drop old anesthesia_staff table → Create new surgery_staff_entries table
-- 2. Rename credential_secret_key → api_password_encrypted in supplier_catalogs
-- 3. Add canLogin and staffType columns to users table

-- Step 1: Drop old anesthesia_staff table if it exists
DROP TABLE IF EXISTS "anesthesia_staff" CASCADE;

-- Step 2: Create new unified surgery_staff_entries table
CREATE TABLE IF NOT EXISTS "surgery_staff_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"user_id" varchar,
	"name" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Step 3: Add FK constraints for surgery_staff_entries (with exception handling for idempotency)
DO $$ BEGIN
 ALTER TABLE "surgery_staff_entries" ADD CONSTRAINT "surgery_staff_entries_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surgery_staff_entries" ADD CONSTRAINT "surgery_staff_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surgery_staff_entries" ADD CONSTRAINT "surgery_staff_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 4: Create indexes for surgery_staff_entries
CREATE INDEX IF NOT EXISTS "idx_surgery_staff_entries_record" ON "surgery_staff_entries" USING btree ("anesthesia_record_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_staff_entries_role" ON "surgery_staff_entries" USING btree ("role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_staff_entries_user" ON "surgery_staff_entries" USING btree ("user_id");
--> statement-breakpoint

-- Step 5: Rename credential_secret_key to api_password_encrypted in supplier_catalogs
-- Using DO block to handle case where column was already renamed or doesn't exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'supplier_catalogs' AND column_name = 'credential_secret_key'
  ) THEN
    ALTER TABLE "supplier_catalogs" RENAME COLUMN "credential_secret_key" TO "api_password_encrypted";
  END IF;
END $$;
--> statement-breakpoint

-- Step 6: Add can_login column to users table (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'can_login'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "can_login" boolean DEFAULT true NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- Step 7: Add staff_type column to users table (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'staff_type'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "staff_type" varchar DEFAULT 'internal' NOT NULL;
  END IF;
END $$;
