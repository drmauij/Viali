DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' AND column_name = 'street'
    ) THEN
        ALTER TABLE "patients" ADD COLUMN "street" varchar;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' AND column_name = 'postal_code'
    ) THEN
        ALTER TABLE "patients" ADD COLUMN "postal_code" varchar;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' AND column_name = 'city'
    ) THEN
        ALTER TABLE "patients" ADD COLUMN "city" varchar;
    END IF;
END $$;
