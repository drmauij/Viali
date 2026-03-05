ALTER TABLE "patient_messages" ADD COLUMN IF NOT EXISTS "direction" varchar(10) DEFAULT 'outbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_messages" ADD COLUMN IF NOT EXISTS "conversation_id" varchar;--> statement-breakpoint
ALTER TABLE "patient_messages" ADD COLUMN IF NOT EXISTS "read_by_staff_at" timestamp;--> statement-breakpoint
ALTER TABLE "patient_messages" ADD COLUMN IF NOT EXISTS "read_by_patient_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_messages_conversation" ON "patient_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_patient_messages_direction" ON "patient_messages" USING btree ("direction");--> statement-breakpoint
UPDATE "patient_messages" SET "conversation_id" = "hospital_id" || ':' || "patient_id" WHERE "conversation_id" IS NULL;
