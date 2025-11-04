ALTER TABLE "notes" ADD COLUMN "scope" varchar(20) DEFAULT 'personal' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_notes_scope" ON "notes" USING btree ("scope");