CREATE TABLE IF NOT EXISTS "marketing_ai_analyses" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hospital_id" varchar NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "language" text NOT NULL,
  "payload" jsonb NOT NULL,
  "input_hash" text NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_by" varchar NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_ai_analyses_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "marketing_ai_analyses" ADD CONSTRAINT "marketing_ai_analyses_hospital_id_hospitals_id_fk"
      FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_ai_analyses_generated_by_users_id_fk') THEN
    ALTER TABLE "marketing_ai_analyses" ADD CONSTRAINT "marketing_ai_analyses_generated_by_users_id_fk"
      FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_ai_analyses_unique_range"
  ON "marketing_ai_analyses" ("hospital_id","start_date","end_date","language");