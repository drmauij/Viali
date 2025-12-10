DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'surgeries' AND column_name = 'planning_status'
    ) THEN
        ALTER TABLE "surgeries" ADD COLUMN "planning_status" varchar DEFAULT 'pre-registered' NOT NULL;
    END IF;
END $$;
