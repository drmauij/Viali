-- Anesthesia Sets and Inventory Sets tables
-- Converted to idempotent format for safe re-running

-- Create anesthesia_sets table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anesthesia_sets') THEN
    CREATE TABLE "anesthesia_sets" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "hospital_id" varchar NOT NULL,
      "name" varchar NOT NULL,
      "description" text,
      "sort_order" integer DEFAULT 0,
      "is_active" boolean DEFAULT true,
      "created_by" varchar,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Create anesthesia_set_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'anesthesia_set_items') THEN
    CREATE TABLE "anesthesia_set_items" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "set_id" varchar NOT NULL,
      "item_type" varchar NOT NULL,
      "config" jsonb NOT NULL,
      "sort_order" integer DEFAULT 0,
      "created_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Create inventory_sets table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_sets') THEN
    CREATE TABLE "inventory_sets" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "hospital_id" varchar NOT NULL,
      "unit_id" varchar,
      "name" varchar NOT NULL,
      "description" text,
      "sort_order" integer DEFAULT 0,
      "is_active" boolean DEFAULT true,
      "created_by" varchar,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Create inventory_set_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_set_items') THEN
    CREATE TABLE "inventory_set_items" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "set_id" varchar NOT NULL,
      "item_id" varchar NOT NULL,
      "quantity" integer DEFAULT 1 NOT NULL,
      "sort_order" integer DEFAULT 0,
      "created_at" timestamp DEFAULT now()
    );
  END IF;
END $$;

-- Add foreign key constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_set_items_set_id_anesthesia_sets_id_fk') THEN
    ALTER TABLE "anesthesia_set_items" ADD CONSTRAINT "anesthesia_set_items_set_id_anesthesia_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."anesthesia_sets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_sets_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "anesthesia_sets" ADD CONSTRAINT "anesthesia_sets_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anesthesia_sets_created_by_users_id_fk') THEN
    ALTER TABLE "anesthesia_sets" ADD CONSTRAINT "anesthesia_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'inventory_set_items_set_id_inventory_sets_id_fk') THEN
    ALTER TABLE "inventory_set_items" ADD CONSTRAINT "inventory_set_items_set_id_inventory_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."inventory_sets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'inventory_set_items_item_id_items_id_fk') THEN
    ALTER TABLE "inventory_set_items" ADD CONSTRAINT "inventory_set_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'inventory_sets_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "inventory_sets" ADD CONSTRAINT "inventory_sets_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'inventory_sets_unit_id_units_id_fk') THEN
    ALTER TABLE "inventory_sets" ADD CONSTRAINT "inventory_sets_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'inventory_sets_created_by_users_id_fk') THEN
    ALTER TABLE "inventory_sets" ADD CONSTRAINT "inventory_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Create indexes (idempotent - CREATE INDEX IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "idx_anesthesia_set_items_set" ON "anesthesia_set_items" USING btree ("set_id");
CREATE INDEX IF NOT EXISTS "idx_anesthesia_sets_hospital" ON "anesthesia_sets" USING btree ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_set_items_set" ON "inventory_set_items" USING btree ("set_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_set_items_item" ON "inventory_set_items" USING btree ("item_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_sets_hospital" ON "inventory_sets" USING btree ("hospital_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_sets_unit" ON "inventory_sets" USING btree ("unit_id");
