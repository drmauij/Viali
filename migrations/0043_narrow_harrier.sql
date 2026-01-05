DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='sent_at') THEN
    ALTER TABLE "orders" ADD COLUMN "sent_at" timestamp;
  END IF;
END $$;
