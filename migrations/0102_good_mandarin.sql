-- Add progress tracking fields to hin_sync_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hin_sync_status' AND column_name = 'processed_items') THEN
    ALTER TABLE "hin_sync_status" ADD COLUMN "processed_items" integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hin_sync_status' AND column_name = 'total_items') THEN
    ALTER TABLE "hin_sync_status" ADD COLUMN "total_items" integer DEFAULT 0;
  END IF;
END $$;
