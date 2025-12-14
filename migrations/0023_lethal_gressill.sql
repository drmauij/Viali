-- Migration 0023: Add questionnaire_token to hospitals and consent_analgosedation to preop_assessments
-- Made idempotent with IF NOT EXISTS checks

-- Create chat tables if they don't exist
CREATE TABLE IF NOT EXISTS "chat_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"storage_key" varchar NOT NULL,
	"filename" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"size_bytes" integer NOT NULL,
	"thumbnail_key" varchar,
	"saved_to_patient_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" varchar,
	"scope_type" varchar NOT NULL,
	"unit_id" varchar,
	"patient_id" varchar,
	"last_message_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_mentions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"mention_type" varchar NOT NULL,
	"mentioned_user_id" varchar,
	"mentioned_unit_id" varchar,
	"mentioned_patient_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar DEFAULT 'text' NOT NULL,
	"reply_to_message_id" varchar,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"conversation_id" varchar NOT NULL,
	"message_id" varchar,
	"notification_type" varchar NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"is_muted" boolean DEFAULT false NOT NULL,
	"last_read_at" timestamp,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_questionnaire_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"patient_id" varchar,
	"surgery_id" varchar,
	"token" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"language" varchar DEFAULT 'de',
	"expires_at" timestamp NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"reviewed_by" varchar,
	CONSTRAINT "patient_questionnaire_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_questionnaire_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" varchar NOT NULL,
	"patient_first_name" varchar,
	"patient_last_name" varchar,
	"patient_birthday" date,
	"patient_email" varchar,
	"patient_phone" varchar,
	"allergies" jsonb,
	"allergies_notes" text,
	"medications" jsonb,
	"medications_notes" text,
	"conditions" jsonb,
	"smoking_status" varchar,
	"smoking_details" text,
	"alcohol_status" varchar,
	"alcohol_details" text,
	"height" varchar,
	"weight" varchar,
	"previous_surgeries" text,
	"previous_anesthesia_problems" text,
	"pregnancy_status" varchar,
	"breastfeeding" boolean,
	"woman_health_notes" text,
	"additional_notes" text,
	"questions_for_doctor" text,
	"current_step" integer DEFAULT 0,
	"completed_steps" jsonb,
	"user_agent" text,
	"ip_address" varchar,
	"last_saved_at" timestamp,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_questionnaire_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" varchar NOT NULL,
	"reviewed_by" varchar NOT NULL,
	"mappings" jsonb,
	"review_notes" text,
	"preop_assessment_id" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_questionnaire_uploads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" varchar NOT NULL,
	"category" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"file_url" varchar NOT NULL,
	"mime_type" varchar,
	"file_size" integer,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
-- Add questionnaire_token to hospitals
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hospitals' AND column_name = 'questionnaire_token') THEN
    ALTER TABLE "hospitals" ADD COLUMN "questionnaire_token" varchar;
  END IF;
END $$;
--> statement-breakpoint
-- Add consent_analgosedation to preop_assessments  
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preop_assessments' AND column_name = 'consent_analgosedation') THEN
    ALTER TABLE "preop_assessments" ADD COLUMN "consent_analgosedation" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint
-- Add unique constraint on chat_participants if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_conversation_participant') THEN
    ALTER TABLE "chat_participants" ADD CONSTRAINT "unique_conversation_participant" UNIQUE("conversation_id","user_id");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
--> statement-breakpoint
-- Foreign keys (safe to add - will fail silently if already exists)
DO $$ BEGIN ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_saved_to_patient_id_patients_id_fk" FOREIGN KEY ("saved_to_patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_mentioned_unit_id_units_id_fk" FOREIGN KEY ("mentioned_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_mentioned_patient_id_patients_id_fk" FOREIGN KEY ("mentioned_patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_notifications" ADD CONSTRAINT "chat_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_notifications" ADD CONSTRAINT "chat_notifications_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_notifications" ADD CONSTRAINT "chat_notifications_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_links" ADD CONSTRAINT "patient_questionnaire_links_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_responses" ADD CONSTRAINT "patient_questionnaire_responses_link_id_patient_questionnaire_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."patient_questionnaire_links"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_reviews" ADD CONSTRAINT "patient_questionnaire_reviews_response_id_patient_questionnaire_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."patient_questionnaire_responses"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_reviews" ADD CONSTRAINT "patient_questionnaire_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_reviews" ADD CONSTRAINT "patient_questionnaire_reviews_preop_assessment_id_preop_assessments_id_fk" FOREIGN KEY ("preop_assessment_id") REFERENCES "public"."preop_assessments"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "patient_questionnaire_uploads" ADD CONSTRAINT "patient_questionnaire_uploads_response_id_patient_questionnaire_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."patient_questionnaire_responses"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Indexes (safe to create if not exists)
CREATE INDEX IF NOT EXISTS "idx_chat_attachments_message" ON "chat_attachments" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_attachments_patient" ON "chat_attachments" USING btree ("saved_to_patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_hospital" ON "chat_conversations" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_creator" ON "chat_conversations" USING btree ("creator_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_scope" ON "chat_conversations" USING btree ("scope_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_unit" ON "chat_conversations" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_patient" ON "chat_conversations" USING btree ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversations_last_message" ON "chat_conversations" USING btree ("last_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_mentions_message" ON "chat_mentions" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_mentions_user" ON "chat_mentions" USING btree ("mentioned_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_mentions_patient" ON "chat_mentions" USING btree ("mentioned_patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation" ON "chat_messages" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_sender" ON "chat_messages" USING btree ("sender_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_created" ON "chat_messages" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_reply" ON "chat_messages" USING btree ("reply_to_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_notifications_user" ON "chat_notifications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_notifications_conversation" ON "chat_notifications" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_notifications_read" ON "chat_notifications" USING btree ("read");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_participants_conversation" ON "chat_participants" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_participants_user" ON "chat_participants" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_links_hospital" ON "patient_questionnaire_links" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_links_patient" ON "patient_questionnaire_links" USING btree ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_links_surgery" ON "patient_questionnaire_links" USING btree ("surgery_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_links_token" ON "patient_questionnaire_links" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_links_status" ON "patient_questionnaire_links" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_responses_link" ON "patient_questionnaire_responses" USING btree ("link_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_reviews_response" ON "patient_questionnaire_reviews" USING btree ("response_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_reviews_assessment" ON "patient_questionnaire_reviews" USING btree ("preop_assessment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questionnaire_uploads_response" ON "patient_questionnaire_uploads" USING btree ("response_id");
--> statement-breakpoint
-- Add unique constraint on hospitals.questionnaire_token if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospitals_questionnaire_token_unique') THEN
    ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_questionnaire_token_unique" UNIQUE("questionnaire_token");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
