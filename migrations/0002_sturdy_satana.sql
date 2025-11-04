-- Add unit_id column as nullable first
ALTER TABLE "orders" ADD COLUMN "unit_id" varchar;--> statement-breakpoint

-- Update existing orders to set unit_id based on the first item's unit in the order
-- If no items exist, use the user's current unit assignment
UPDATE "orders" o
SET "unit_id" = COALESCE(
  (
    SELECT i."unit_id"
    FROM "order_lines" ol
    INNER JOIN "items" i ON ol."item_id" = i."id"
    WHERE ol."order_id" = o."id"
    LIMIT 1
  ),
  (
    SELECT uhr."unit_id"
    FROM "user_hospital_roles" uhr
    WHERE uhr."user_id" = o."created_by" AND uhr."hospital_id" = o."hospital_id"
    LIMIT 1
  )
)
WHERE "unit_id" IS NULL;--> statement-breakpoint

-- Make the column NOT NULL after data migration
ALTER TABLE "orders" ALTER COLUMN "unit_id" SET NOT NULL;--> statement-breakpoint

-- Add foreign key constraint
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Create index
CREATE INDEX "idx_orders_unit" ON "orders" USING btree ("unit_id");