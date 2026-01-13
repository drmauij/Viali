-- Migration: Add availabilityMode to user_hospital_roles
-- This consolidates the bookable provider configuration into a single table

-- Step 1: Add the availability_mode column to user_hospital_roles
ALTER TABLE "user_hospital_roles" ADD COLUMN IF NOT EXISTS "availability_mode" varchar DEFAULT 'always_available';

-- Step 2: Migrate existing availability_mode data from clinic_providers to user_hospital_roles
-- Match by user_id AND unit_id to get the correct availability mode for each role
UPDATE "user_hospital_roles" uhr
SET "availability_mode" = cp."availability_mode"
FROM "clinic_providers" cp
WHERE uhr."user_id" = cp."user_id" 
  AND uhr."unit_id" = cp."unit_id"
  AND cp."availability_mode" IS NOT NULL;

-- Step 3: Sync isBookable from clinic_providers to user_hospital_roles where they differ
-- This ensures any existing bookable providers in clinic_providers are reflected in user_hospital_roles
UPDATE "user_hospital_roles" uhr
SET "is_bookable" = true
FROM "clinic_providers" cp
WHERE uhr."user_id" = cp."user_id" 
  AND uhr."unit_id" = cp."unit_id"
  AND cp."is_bookable" = true
  AND uhr."is_bookable" = false;
