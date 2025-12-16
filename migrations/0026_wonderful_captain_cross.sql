-- Create surgery_notes table (idempotent)
CREATE TABLE IF NOT EXISTS "surgery_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surgery_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgery_notes_surgery_id_surgeries_id_fk') THEN
    ALTER TABLE "surgery_notes" ADD CONSTRAINT "surgery_notes_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'surgery_notes_author_id_users_id_fk') THEN
    ALTER TABLE "surgery_notes" ADD CONSTRAINT "surgery_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_notes_surgery" ON "surgery_notes" USING btree ("surgery_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_notes_author" ON "surgery_notes" USING btree ("author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_notes_created" ON "surgery_notes" USING btree ("created_at");
