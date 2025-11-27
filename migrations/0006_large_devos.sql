ALTER TABLE "surgeries" ADD COLUMN "surgeon_id" varchar;--> statement-breakpoint
ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_surgeon_id_users_id_fk" FOREIGN KEY ("surgeon_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_surgeries_surgeon" ON "surgeries" USING btree ("surgeon_id");