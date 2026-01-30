DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'item_hin_matches') THEN
    CREATE TABLE "item_hin_matches" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "item_id" varchar NOT NULL,
      "hospital_id" varchar NOT NULL,
      "match_status" varchar DEFAULT 'pending',
      "match_method" varchar,
      "match_confidence" numeric(3, 2),
      "match_reason" text,
      "hin_article_id" varchar,
      "hin_pharmacode" varchar,
      "hin_gtin" varchar,
      "hin_description_de" text,
      "hin_pexf" numeric(10, 2),
      "hin_ppub" numeric(10, 2),
      "hin_smcat" varchar,
      "hin_swissmedic_no" varchar,
      "original_pharmacode" varchar,
      "original_gtin" varchar,
      "item_name" varchar,
      "last_match_attempt" timestamp DEFAULT now(),
      "verified_at" timestamp,
      "verified_by" varchar,
      "applied_at" timestamp,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'item_hin_matches_item_id_items_id_fk') THEN
    ALTER TABLE "item_hin_matches" ADD CONSTRAINT "item_hin_matches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'item_hin_matches_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "item_hin_matches" ADD CONSTRAINT "item_hin_matches_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'item_hin_matches_verified_by_users_id_fk') THEN
    ALTER TABLE "item_hin_matches" ADD CONSTRAINT "item_hin_matches_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_item_hin_matches_item" ON "item_hin_matches" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "idx_item_hin_matches_hospital" ON "item_hin_matches" USING btree ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_item_hin_matches_status" ON "item_hin_matches" USING btree ("match_status");
