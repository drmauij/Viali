-- Add is_service flag to items for service items that should be excluded from inventory value calculations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'is_service') THEN
    ALTER TABLE "items" ADD COLUMN "is_service" boolean DEFAULT false;
  END IF;
END $$;
