-- Migrate checklist_templates.room_id (varchar) to room_ids (text[])
-- This change was missed between migrations 0116 and 0117

-- Step 1: Add the new room_ids array column if it doesn't exist
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "room_ids" text[] DEFAULT '{}';

-- Step 2: Migrate data from old room_id to new room_ids (if room_id exists and has data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'room_id'
  ) THEN
    UPDATE "checklist_templates"
    SET "room_ids" = ARRAY["room_id"]
    WHERE "room_id" IS NOT NULL AND ("room_ids" IS NULL OR "room_ids" = '{}');

    ALTER TABLE "checklist_templates" DROP CONSTRAINT IF EXISTS "checklist_templates_room_id_surgery_rooms_id_fk";
    ALTER TABLE "checklist_templates" DROP COLUMN "room_id";
  END IF;
END $$;
