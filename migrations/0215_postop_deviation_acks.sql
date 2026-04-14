CREATE TABLE IF NOT EXISTS "postop_deviation_acknowledgments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "anesthesia_record_id" varchar NOT NULL,
  "parameter" text NOT NULL,
  "recorded_at" timestamp NOT NULL,
  "recorded_value" integer NOT NULL,
  "bound_kind" text NOT NULL,
  "resolved_by" varchar NOT NULL,
  "resolved_at" timestamp DEFAULT now() NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_deviation_acknowledgments_anesthesia_record_id_fkey') THEN
    ALTER TABLE "postop_deviation_acknowledgments" ADD CONSTRAINT "postop_deviation_acknowledgments_anesthesia_record_id_fkey"
      FOREIGN KEY ("anesthesia_record_id") REFERENCES "anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_deviation_acknowledgments_resolved_by_fkey') THEN
    ALTER TABLE "postop_deviation_acknowledgments" ADD CONSTRAINT "postop_deviation_acknowledgments_resolved_by_fkey"
      FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "postop_deviation_acks_record_idx" ON "postop_deviation_acknowledgments" ("anesthesia_record_id");
