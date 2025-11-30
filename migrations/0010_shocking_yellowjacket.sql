ALTER TABLE "anesthesia_records" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "locked_by" varchar;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "unlocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "unlocked_by" varchar;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD COLUMN "unlock_reason" text;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;