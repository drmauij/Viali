DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'high_priority') THEN
    ALTER TABLE "orders" ADD COLUMN "high_priority" boolean DEFAULT false;
  END IF;
END $$;
