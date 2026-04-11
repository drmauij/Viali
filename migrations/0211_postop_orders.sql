CREATE TABLE IF NOT EXISTS "postop_order_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "hospital_id" varchar NOT NULL,
  "name" varchar NOT NULL,
  "description" text,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "procedure_code" varchar,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_order_templates_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "postop_order_templates" ADD CONSTRAINT "postop_order_templates_hospital_id_hospitals_id_fk"
      FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "postop_order_sets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "anesthesia_record_id" varchar NOT NULL UNIQUE,
  "template_id" varchar,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "signed_by" varchar,
  "signed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_order_sets_anesthesia_record_id_anesthesia_records_id_fk') THEN
    ALTER TABLE "postop_order_sets" ADD CONSTRAINT "postop_order_sets_anesthesia_record_id_anesthesia_records_id_fk"
      FOREIGN KEY ("anesthesia_record_id") REFERENCES "anesthesia_records"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_order_sets_template_id_postop_order_templates_id_fk') THEN
    ALTER TABLE "postop_order_sets" ADD CONSTRAINT "postop_order_sets_template_id_postop_order_templates_id_fk"
      FOREIGN KEY ("template_id") REFERENCES "postop_order_templates"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_order_sets_signed_by_users_id_fk') THEN
    ALTER TABLE "postop_order_sets" ADD CONSTRAINT "postop_order_sets_signed_by_users_id_fk"
      FOREIGN KEY ("signed_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "postop_planned_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_set_id" varchar NOT NULL,
  "item_id" varchar NOT NULL,
  "kind" varchar NOT NULL,
  "planned_at" timestamp NOT NULL,
  "planned_end_at" timestamp,
  "payload_snapshot" jsonb NOT NULL,
  "status" varchar NOT NULL DEFAULT 'planned',
  "done_at" timestamp,
  "done_by" varchar,
  "done_value" jsonb
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_planned_events_order_set_id_postop_order_sets_id_fk') THEN
    ALTER TABLE "postop_planned_events" ADD CONSTRAINT "postop_planned_events_order_set_id_postop_order_sets_id_fk"
      FOREIGN KEY ("order_set_id") REFERENCES "postop_order_sets"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postop_planned_events_done_by_users_id_fk') THEN
    ALTER TABLE "postop_planned_events" ADD CONSTRAINT "postop_planned_events_done_by_users_id_fk"
      FOREIGN KEY ("done_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_postop_planned_events_order_set_id" ON "postop_planned_events" ("order_set_id");
CREATE INDEX IF NOT EXISTS "idx_postop_planned_events_planned_at" ON "postop_planned_events" ("planned_at");
CREATE INDEX IF NOT EXISTS "idx_postop_order_templates_hospital_id" ON "postop_order_templates" ("hospital_id");
