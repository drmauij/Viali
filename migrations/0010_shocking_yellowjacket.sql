DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'is_locked') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'locked_at') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "locked_at" timestamp;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'locked_by') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "locked_by" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'unlocked_at') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "unlocked_at" timestamp;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'unlocked_by') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "unlocked_by" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anesthesia_records' AND column_name = 'unlock_reason') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "unlock_reason" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_records_locked_by_users_id_fk') THEN
    ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_records_unlocked_by_users_id_fk') THEN
    ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
