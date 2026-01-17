-- Create room_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_type') THEN
    CREATE TYPE "public"."room_type" AS ENUM('OP', 'PACU');
  END IF;
END $$;

-- Add pacu_bed_id column to surgeries if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgeries' AND column_name = 'pacu_bed_id') THEN
    ALTER TABLE "surgeries" ADD COLUMN "pacu_bed_id" varchar;
  END IF;
END $$;

-- Add type column to surgery_rooms if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'surgery_rooms' AND column_name = 'type') THEN
    ALTER TABLE "surgery_rooms" ADD COLUMN "type" "room_type" DEFAULT 'OP' NOT NULL;
  END IF;
END $$;

-- Add foreign key constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'surgeries_pacu_bed_id_surgery_rooms_id_fk') THEN
    ALTER TABLE "surgeries" ADD CONSTRAINT "surgeries_pacu_bed_id_surgery_rooms_id_fk" FOREIGN KEY ("pacu_bed_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

-- Create index on surgeries.pacu_bed_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_surgeries_pacu_bed') THEN
    CREATE INDEX "idx_surgeries_pacu_bed" ON "surgeries" USING btree ("pacu_bed_id");
  END IF;
END $$;

-- Create index on surgery_rooms.type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_surgery_rooms_type') THEN
    CREATE INDEX "idx_surgery_rooms_type" ON "surgery_rooms" USING btree ("type");
  END IF;
END $$;
