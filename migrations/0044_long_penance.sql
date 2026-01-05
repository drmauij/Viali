-- Order Attachments table (idempotent)
CREATE TABLE IF NOT EXISTS "order_attachments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" varchar NOT NULL,
  "filename" varchar NOT NULL,
  "content_type" varchar,
  "storage_key" varchar NOT NULL,
  "uploaded_by" varchar NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- Foreign keys (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_attachments_order_id_orders_id_fk') THEN
    ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_attachments_uploaded_by_users_id_fk') THEN
    ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Index (idempotent)
CREATE INDEX IF NOT EXISTS "idx_order_attachments_order" ON "order_attachments" USING btree ("order_id");
