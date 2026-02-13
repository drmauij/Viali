-- Add room_id column to checklist_completions and checklist_dismissals
-- This was added to the schema but never had a proper migration

ALTER TABLE "checklist_completions" ADD COLUMN IF NOT EXISTS "room_id" varchar;

ALTER TABLE "checklist_dismissals" ADD COLUMN IF NOT EXISTS "room_id" varchar;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_completions_room_id_surgery_rooms_id_fk') THEN
    ALTER TABLE "checklist_completions" ADD CONSTRAINT "checklist_completions_room_id_surgery_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_dismissals_room_id_surgery_rooms_id_fk') THEN
    ALTER TABLE "checklist_dismissals" ADD CONSTRAINT "checklist_dismissals_room_id_surgery_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
