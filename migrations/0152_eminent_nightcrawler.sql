DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_type') THEN
    CREATE TYPE "public"."portal_type" AS ENUM('patient', 'worklog', 'surgeon');
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_access_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" varchar(128) NOT NULL,
	"portal_type" "portal_type" NOT NULL,
	"portal_token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "portal_access_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_verification_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_type" "portal_type" NOT NULL,
	"portal_token" varchar NOT NULL,
	"verification_token" varchar NOT NULL,
	"code_hash" varchar NOT NULL,
	"delivery_method" varchar NOT NULL,
	"delivered_to" varchar NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "portal_verification_codes_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_sessions_token" ON "portal_access_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_sessions_portal" ON "portal_access_sessions" USING btree ("portal_type","portal_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_vc_portal" ON "portal_verification_codes" USING btree ("portal_type","portal_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_vc_verification_token" ON "portal_verification_codes" USING btree ("verification_token");
