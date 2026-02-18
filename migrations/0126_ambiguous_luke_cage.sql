-- Make item_id nullable in both discharge medication item tables
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discharge_medication_template_items'
      AND column_name = 'item_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "discharge_medication_template_items" ALTER COLUMN "item_id" DROP NOT NULL;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patient_discharge_medication_items'
      AND column_name = 'item_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "patient_discharge_medication_items" ALTER COLUMN "item_id" DROP NOT NULL;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discharge_medication_template_items'
      AND column_name = 'custom_name'
  ) THEN
    ALTER TABLE "discharge_medication_template_items" ADD COLUMN "custom_name" varchar;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patient_discharge_medication_items'
      AND column_name = 'custom_name'
  ) THEN
    ALTER TABLE "patient_discharge_medication_items" ADD COLUMN "custom_name" varchar;
  END IF;
END $$;
