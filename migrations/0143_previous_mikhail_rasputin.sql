CREATE TABLE IF NOT EXISTS "surgery_assistants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surgery_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"calcom_busy_block_uid" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_surgery_assistant" UNIQUE("surgery_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_assistants" ADD CONSTRAINT "surgery_assistants_surgery_id_surgeries_id_fk" FOREIGN KEY ("surgery_id") REFERENCES "public"."surgeries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "surgery_assistants" ADD CONSTRAINT "surgery_assistants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_assistants_surgery" ON "surgery_assistants" USING btree ("surgery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgery_assistants_user" ON "surgery_assistants" USING btree ("user_id");
