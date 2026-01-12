DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_hospital_roles' AND column_name = 'is_default_login'
    ) THEN
        ALTER TABLE "user_hospital_roles" ADD COLUMN "is_default_login" boolean DEFAULT false;
    END IF;
END $$;