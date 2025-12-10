ALTER TABLE "patients" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "archived_by" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "surgeries" ADD COLUMN "archived_by" varchar;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_patients_archived" ON "patients" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "idx_surgeries_archived" ON "surgeries" USING btree ("is_archived");