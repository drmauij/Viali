DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calcom_config' AND column_name = 'feed_token'
    ) THEN
        ALTER TABLE "calcom_config" ADD COLUMN "feed_token" varchar;
    END IF;
END $$;
