DO $$ BEGIN
  ALTER TABLE "or_medications" DROP CONSTRAINT IF EXISTS "or_medications_anesthesia_record_id_anesthesia_records_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "or_medications" ADD CONSTRAINT "or_medications_anesthesia_record_id_anesthesia_records_id_fk" FOREIGN KEY ("anesthesia_record_id") REFERENCES "public"."anesthesia_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
