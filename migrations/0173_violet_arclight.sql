ALTER TABLE "provider_availability_windows" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT true NOT NULL;
