-- Add new enum values to discharge_brief_type
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'surgery_report'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'discharge_brief_type')
  ) THEN
    ALTER TYPE "public"."discharge_brief_type" ADD VALUE 'surgery_report';
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'generic'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'discharge_brief_type')
  ) THEN
    ALTER TYPE "public"."discharge_brief_type" ADD VALUE 'generic';
  END IF;
END $$;--> statement-breakpoint

-- Create template_visibility enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_visibility') THEN
    CREATE TYPE "public"."template_visibility" AS ENUM('personal', 'unit', 'hospital');
  END IF;
END $$;--> statement-breakpoint

-- Add visibility and shared_with_unit_id columns
ALTER TABLE "discharge_brief_templates" ADD COLUMN IF NOT EXISTS "visibility" "template_visibility" DEFAULT 'hospital' NOT NULL;--> statement-breakpoint
ALTER TABLE "discharge_brief_templates" ADD COLUMN IF NOT EXISTS "shared_with_unit_id" varchar;--> statement-breakpoint

-- Add FK constraint for shared_with_unit_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discharge_brief_templates_shared_with_unit_id_units_id_fk'
  ) THEN
    ALTER TABLE "discharge_brief_templates" ADD CONSTRAINT "discharge_brief_templates_shared_with_unit_id_units_id_fk"
      FOREIGN KEY ("shared_with_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Add indexes
CREATE INDEX IF NOT EXISTS "idx_discharge_brief_templates_visibility" ON "discharge_brief_templates" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_discharge_brief_templates_unit" ON "discharge_brief_templates" USING btree ("shared_with_unit_id");--> statement-breakpoint

-- Data migration: set visibility for existing templates
UPDATE "discharge_brief_templates" SET "visibility" = 'personal' WHERE "assigned_user_id" IS NOT NULL AND "visibility" = 'hospital';--> statement-breakpoint
UPDATE "discharge_brief_templates" SET "assigned_user_id" = "created_by" WHERE "assigned_user_id" IS NULL;
