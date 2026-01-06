CREATE TABLE IF NOT EXISTS "camera_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" varchar NOT NULL,
	"camera_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"surgery_room_id" varchar,
	"capture_interval_seconds" integer DEFAULT 300,
	"is_active" boolean DEFAULT true,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='anesthesia_records' AND column_name='camera_device_id') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "camera_device_id" varchar;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='anesthesia_records' AND column_name='auto_capture_enabled') THEN
    ALTER TABLE "anesthesia_records" ADD COLUMN "auto_capture_enabled" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='camera_devices_hospital_id_hospitals_id_fk') THEN
    ALTER TABLE "camera_devices" ADD CONSTRAINT "camera_devices_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='camera_devices_surgery_room_id_surgery_rooms_id_fk') THEN
    ALTER TABLE "camera_devices" ADD CONSTRAINT "camera_devices_surgery_room_id_surgery_rooms_id_fk" FOREIGN KEY ("surgery_room_id") REFERENCES "public"."surgery_rooms"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camera_devices_hospital" ON "camera_devices" USING btree ("hospital_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_camera_devices_camera_id" ON "camera_devices" USING btree ("camera_id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='anesthesia_records_camera_device_id_camera_devices_id_fk') THEN
    ALTER TABLE "anesthesia_records" ADD CONSTRAINT "anesthesia_records_camera_device_id_camera_devices_id_fk" FOREIGN KEY ("camera_device_id") REFERENCES "public"."camera_devices"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
