CREATE TABLE "note_attachments" (
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
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_note_attachments_note" ON "note_attachments" USING btree ("note_type","note_id");--> statement-breakpoint
CREATE INDEX "idx_note_attachments_uploaded_by" ON "note_attachments" USING btree ("uploaded_by");