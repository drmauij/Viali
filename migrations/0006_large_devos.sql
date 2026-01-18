DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'surgeon_id') THEN
    ALTER TABLE "surgeries" ADD COLUMN "surgeon_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'surgeries_surgeon_id_users_id_fk') THEN
    ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_surgeon_id_users_id_fk" FOREIGN KEY ("surgeon_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_surgeries_surgeon" ON "surgeries" USING btree ("surgeon_id");
