-- Add CLINIC room type for pre-op waiting/reception rooms
-- Adds a new enum value and a nullable FK on surgeries
ALTER TYPE "room_type" ADD VALUE IF NOT EXISTS 'CLINIC';

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "clinic_room_id" varchar REFERENCES "surgery_rooms"("id");

CREATE INDEX IF NOT EXISTS "idx_surgeries_clinic_room" ON "surgeries" ("clinic_room_id");
