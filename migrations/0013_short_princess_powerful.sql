CREATE TABLE "surgery_staff_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anesthesia_record_id" varchar NOT NULL,
	"role" varchar NOT NULL,
	"user_id" varchar,
	"name" varchar NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DROP TABLE "anesthesia_staff" CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_catalogs" RENAME COLUMN "credential_secret_key" TO "api_password_encrypted";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "can_login" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "staff_type" varchar DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "surgery_staff_entries" ADD CONSTRAINT "surgery_staff_entries_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgery_staff_entries" ADD CONSTRAINT "surgery_staff_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgery_staff_entries" ADD CONSTRAINT "surgery_staff_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_surgery_staff_entries_record" ON "surgery_staff_entries" USING btree ("anesthesia_record_id");--> statement-breakpoint
CREATE INDEX "idx_surgery_staff_entries_role" ON "surgery_staff_entries" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_surgery_staff_entries_user" ON "surgery_staff_entries" USING btree ("user_id");