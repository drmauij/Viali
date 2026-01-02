DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='status') THEN
    ALTER TABLE "items" ADD COLUMN "status" varchar DEFAULT 'active' NOT NULL;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_items_status" ON "items" USING btree ("status");