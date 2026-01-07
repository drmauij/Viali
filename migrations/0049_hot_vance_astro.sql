CREATE TABLE IF NOT EXISTS "note_attachments" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "note_type" varchar NOT NULL,
        "note_id" varchar NOT NULL,
        "storage_key" varchar NOT NULL,
        "file_name" varchar NOT NULL,
        "mime_type" varchar NOT NULL,
        "file_size" integer,
        "uploaded_by" varchar,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_attachments_uploaded_by_users_id_fk') THEN
    ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_note_attachments_note" ON "note_attachments" USING btree ("note_type","note_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_note_attachments_uploaded_by" ON "note_attachments" USING btree ("uploaded_by");