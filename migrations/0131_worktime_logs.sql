-- Add weekly_target_hours column to users table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'weekly_target_hours'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "weekly_target_hours" numeric(5, 2);
  END IF;
END $$;

-- Create worktime_logs table
CREATE TABLE IF NOT EXISTS "worktime_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "hospital_id" varchar NOT NULL,
  "entered_by_id" varchar,
  "work_date" date NOT NULL,
  "time_start" varchar(5) NOT NULL,
  "time_end" varchar(5) NOT NULL,
  "pause_minutes" integer NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add foreign keys (idempotent: constraint names are unique)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'worktime_logs_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "worktime_logs" ADD CONSTRAINT "worktime_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'worktime_logs_hospital_id_hospitals_id_fk'
  ) THEN
    ALTER TABLE "worktime_logs" ADD CONSTRAINT "worktime_logs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'worktime_logs_entered_by_id_users_id_fk'
  ) THEN
    ALTER TABLE "worktime_logs" ADD CONSTRAINT "worktime_logs_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_worktime_logs_user_date" ON "worktime_logs" USING btree ("user_id", "work_date");
CREATE INDEX IF NOT EXISTS "idx_worktime_logs_hospital" ON "worktime_logs" USING btree ("hospital_id");
