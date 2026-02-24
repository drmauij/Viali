DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_merge_status') THEN
    CREATE TYPE "public"."staff_merge_status" AS ENUM('completed', 'undone');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_merges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"primary_user_id" varchar NOT NULL,
	"secondary_user_id" varchar NOT NULL,
	"merged_by" varchar NOT NULL,
	"primary_user_snapshot" jsonb NOT NULL,
	"secondary_user_snapshot" jsonb NOT NULL,
	"fk_updates" jsonb NOT NULL,
	"role_merges" jsonb NOT NULL,
	"field_choices" jsonb NOT NULL,
	"linked_orphans" jsonb,
	"status" "staff_merge_status" DEFAULT 'completed' NOT NULL,
	"undone_at" timestamp,
	"undone_by" varchar,
	"created_at" timestamp DEFAULT now()
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_merges_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "staff_merges" ADD CONSTRAINT "staff_merges_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_merges_primary_user_id_users_id_fk') THEN
    ALTER TABLE "staff_merges" ADD CONSTRAINT "staff_merges_primary_user_id_users_id_fk" FOREIGN KEY ("primary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_merges_secondary_user_id_users_id_fk') THEN
    ALTER TABLE "staff_merges" ADD CONSTRAINT "staff_merges_secondary_user_id_users_id_fk" FOREIGN KEY ("secondary_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_merges_merged_by_users_id_fk') THEN
    ALTER TABLE "staff_merges" ADD CONSTRAINT "staff_merges_merged_by_users_id_fk" FOREIGN KEY ("merged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'staff_merges_undone_by_users_id_fk') THEN
    ALTER TABLE "staff_merges" ADD CONSTRAINT "staff_merges_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_merges_hospital" ON "staff_merges" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_merges_primary" ON "staff_merges" USING btree ("primary_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_merges_secondary" ON "staff_merges" USING btree ("secondary_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_merges_status" ON "staff_merges" USING btree ("status");
